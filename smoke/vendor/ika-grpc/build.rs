fn main() -> Result<(), Box<dyn std::error::Error>> {
    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let proto_file = manifest_dir.join("proto/ika_dwallet.proto");
    let proto_dir = proto_file.parent().unwrap().to_path_buf();

    let mut config = prost_build::Config::new();
    config.protoc_executable(protoc_bin_vendored::protoc_bin_path()?);

    tonic_prost_build::configure()
        .build_client(true)
        .build_server(true)
        .compile_with_config(config, &[&proto_file], &[&proto_dir])?;

    println!("cargo:rerun-if-changed={}", proto_file.display());
    Ok(())
}
