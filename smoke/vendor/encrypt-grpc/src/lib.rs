// Copyright (c) dWallet Labs, Ltd.
// SPDX-License-Identifier: BSD-3-Clause-Clear

//! Chain-agnostic gRPC types for the Encrypt executor service.
//!
//! Generated from `proto/encrypt_service.proto`. Provides both client and
//! server types for the `EncryptService` gRPC API.

include!(concat!(env!("OUT_DIR"), "/encrypt.v1.rs"));
