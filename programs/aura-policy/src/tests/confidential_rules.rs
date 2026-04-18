use encrypt_types::{
    graph::{get_node, parse_graph, GraphNodeKind},
    identifier::{
        decode_mock_identifier, encode_mock_digest, mock_binary_compute, mock_select,
        mock_unary_compute,
    },
    types::{FheOperation, FheType},
};

use crate::{
    context::PolicyEvaluationContext,
    engine::evaluate_public_precheck,
    graphs::{
        confidential_policy_graph, confidential_scalar_policy_graph,
        confidential_spend_guardrails_graph_bytes,
        confidential_spend_guardrails_vector_graph_bytes,
    },
    state::PolicyState,
    violations::ViolationCode,
};

use super::engine_rules::base_tx;

fn decode_operation(op_type: u8) -> FheOperation {
    match op_type {
        0 => FheOperation::Add,
        1 => FheOperation::Multiply,
        2 => FheOperation::Negate,
        3 => FheOperation::Subtract,
        4 => FheOperation::Divide,
        5 => FheOperation::Modulo,
        6 => FheOperation::Min,
        7 => FheOperation::Max,
        8 => FheOperation::Blend,
        9 => FheOperation::AddScalar,
        10 => FheOperation::MultiplyScalar,
        11 => FheOperation::SubtractScalar,
        12 => FheOperation::DivideScalar,
        13 => FheOperation::ModuloScalar,
        14 => FheOperation::MinScalar,
        15 => FheOperation::MaxScalar,
        20 => FheOperation::Xor,
        21 => FheOperation::And,
        22 => FheOperation::Not,
        23 => FheOperation::Or,
        24 => FheOperation::Nor,
        25 => FheOperation::Nand,
        26 => FheOperation::ShiftLeft,
        27 => FheOperation::ShiftRight,
        28 => FheOperation::RotateLeft,
        29 => FheOperation::RotateRight,
        30 => FheOperation::AndScalar,
        31 => FheOperation::OrScalar,
        32 => FheOperation::XorScalar,
        40 => FheOperation::IsLessThan,
        41 => FheOperation::IsEqual,
        42 => FheOperation::IsNotEqual,
        43 => FheOperation::IsGreaterThan,
        44 => FheOperation::IsGreaterOrEqual,
        45 => FheOperation::IsLessOrEqual,
        46 => FheOperation::IsLessThanScalar,
        47 => FheOperation::IsEqualScalar,
        48 => FheOperation::IsNotEqualScalar,
        49 => FheOperation::IsGreaterThanScalar,
        50 => FheOperation::IsGreaterOrEqualScalar,
        51 => FheOperation::IsLessOrEqualScalar,
        60 => FheOperation::Select,
        61 => FheOperation::SelectScalar,
        70 => FheOperation::Random,
        71 => FheOperation::RandomRange,
        80 => FheOperation::ExtractLsbs,
        81 => FheOperation::PackInto,
        82 => FheOperation::Into,
        83 => FheOperation::ToBoolean,
        84 => FheOperation::ExtractMsbs,
        85 => FheOperation::Bootstrap,
        86 => FheOperation::ThinBootstrap,
        90 => FheOperation::Gather,
        91 => FheOperation::Scatter,
        92 => FheOperation::Assign,
        93 => FheOperation::AssignScalars,
        94 => FheOperation::Copy,
        95 => FheOperation::Get,
        100 => FheOperation::From,
        101 => FheOperation::Encrypt,
        102 => FheOperation::Decrypt,
        103 => FheOperation::KeySwitch,
        104 => FheOperation::ReEncrypt,
        value => panic!("unsupported mock operation {value}"),
    }
}

/// Executes a compiled FHE graph in mock mode using the `encrypt_types` test
/// utilities. Parses the graph bytes, walks each node in topological order,
/// and simulates each operation using mock digests that encode plaintext values.
/// Returns the decoded plaintext output values in output-node order.
///
/// This lets us verify the graph's arithmetic logic (violation code derivation,
/// `next_spent_today` selection) without a live Encrypt network.
fn run_mock(graph_fn: fn() -> Vec<u8>, inputs: &[u128], fhe_types: &[FheType]) -> Vec<u128> {
    let data = graph_fn();
    let parsed_graph = parse_graph(&data).expect("graph should parse");
    let num_nodes = parsed_graph.header().num_nodes() as usize;
    let mut digests: Vec<[u8; 32]> = Vec::with_capacity(num_nodes);
    let mut input_index = 0usize;

    for i in 0..num_nodes {
        let node = get_node(parsed_graph.node_bytes(), i as u16).expect("node should parse");
        let fhe_type = FheType::from_u8(node.fhe_type()).unwrap_or(FheType::EUint64);

        let digest = match node.kind() {
            kind if kind == GraphNodeKind::Input as u8 => {
                let value = inputs[input_index];
                let input_type = fhe_types[input_index];
                input_index += 1;
                encode_mock_digest(input_type, value)
            }
            kind if kind == GraphNodeKind::Constant as u8 => {
                let width = fhe_type.byte_width().min(16);
                let offset = node.const_offset() as usize;
                let mut buf = [0u8; 16];
                buf[..width].copy_from_slice(&parsed_graph.constants()[offset..offset + width]);
                encode_mock_digest(fhe_type, u128::from_le_bytes(buf))
            }
            kind if kind == GraphNodeKind::Op as u8 => {
                let (a, b, c) = (
                    node.input_a() as usize,
                    node.input_b() as usize,
                    node.input_c() as usize,
                );
                if node.op_type() == 60 {
                    mock_select(&digests[a], &digests[b], &digests[c])
                } else if b == 0xFFFF {
                    mock_unary_compute(decode_operation(node.op_type()), &digests[a], fhe_type)
                } else {
                    mock_binary_compute(
                        decode_operation(node.op_type()),
                        &digests[a],
                        &digests[b],
                        fhe_type,
                    )
                }
            }
            kind if kind == GraphNodeKind::Output as u8 => digests[node.input_a() as usize],
            _ => panic!("unexpected graph node kind"),
        };
        digests.push(digest);
    }

    (0..num_nodes)
        .filter(|&i| {
            get_node(parsed_graph.node_bytes(), i as u16)
                .expect("node should parse")
                .kind()
                == GraphNodeKind::Output as u8
        })
        .map(|i| decode_mock_identifier(&digests[i]))
        .collect()
}

#[test]
fn confidential_graph_approves_and_updates_spent_today() {
    let output = run_mock(
        confidential_spend_guardrails_graph_bytes,
        &[1_000, 300, 200, 250],
        &[
            FheType::EUint64,
            FheType::EUint64,
            FheType::EUint64,
            FheType::EUint64,
        ],
    );

    assert_eq!(output, vec![0, 450]);
}

#[test]
fn confidential_graph_surfaces_per_transaction_and_daily_violations() {
    let per_tx_output = run_mock(
        confidential_spend_guardrails_graph_bytes,
        &[1_000, 300, 200, 350],
        &[
            FheType::EUint64,
            FheType::EUint64,
            FheType::EUint64,
            FheType::EUint64,
        ],
    );
    assert_eq!(per_tx_output, vec![1, 200]);

    let daily_output = run_mock(
        confidential_spend_guardrails_graph_bytes,
        &[1_000, 1_000, 200, 900],
        &[
            FheType::EUint64,
            FheType::EUint64,
            FheType::EUint64,
            FheType::EUint64,
        ],
    );
    assert_eq!(daily_output, vec![2, 200]);
}

#[test]
fn public_precheck_defers_private_spend_limits_but_keeps_advanced_rules() {
    let mut tx = base_tx();
    tx.amount_usd = 4_500;

    let decision = evaluate_public_precheck(
        &crate::PolicyConfig {
            daytime_hourly_limit_usd: 10_000,
            nighttime_hourly_limit_usd: 10_000,
            velocity_limit_usd: 10_000,
            ..crate::PolicyConfig::default()
        },
        &PolicyState::default(),
        &PolicyEvaluationContext::from(tx),
    );

    assert!(decision.approved);
    assert_eq!(decision.violation, ViolationCode::None);
    assert!(decision
        .trace
        .iter()
        .any(|outcome| outcome.rule_name == "confidential_spend_guardrails"));
}

#[test]
fn confidential_graph_spec_exposes_encrypt_metadata() {
    let spec = confidential_scalar_policy_graph();

    assert_eq!(spec.name, "confidential_spend_guardrails_scalar_v1");
    assert!(spec.uses_update_mode);
    assert!(spec.requires_decryption);
}

#[test]
fn confidential_vector_graph_exposes_vector_metadata_and_ops() {
    let spec = confidential_policy_graph();
    let graph_bytes = confidential_spend_guardrails_vector_graph_bytes();
    let graph = parse_graph(&graph_bytes).expect("vector graph should parse");
    let mut op_types = Vec::new();

    for index in 0..graph.header().num_nodes() {
        let node = get_node(graph.node_bytes(), index).expect("node should parse");
        if node.kind() == GraphNodeKind::Op as u8 {
            op_types.push(node.op_type());
        }
    }

    assert_eq!(spec.name, "confidential_spend_guardrails_vector_v3");
    assert_eq!(graph.header().num_inputs(), 2);
    assert_eq!(graph.header().num_outputs(), 1);
    assert!(op_types.contains(&92), "vector graph should use assign");
    assert!(op_types.contains(&95), "vector graph should use get");
}
