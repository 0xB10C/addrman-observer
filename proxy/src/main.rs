#![cfg_attr(feature = "strict", deny(warnings))]

use bitcoincore_rpc::Client;
use bitcoincore_rpc::RpcApi;
use env_logger::Env;
use log::{error, info};
use std::process;
use warp::reply::WithStatus;
use warp::{http::StatusCode, reply, Filter};

mod config;
mod error;

fn proxy_getrawaddrman(node: &config::Node) -> WithStatus<String> {
    let rpc = match Client::new(&node.url.clone(), node.auth.clone()) {
        Ok(c) => c,
        Err(e) => {
            error!(
                "Could not create a RPC client for node {}: {:?}",
                node.url, e
            );
            process::exit(1);
        }
    };
    match rpc.get_raw_addrman() {
        Ok(addrman) => match serde_json::to_string(&addrman) {
            Ok(json) => return reply::with_status(json, StatusCode::OK),
            Err(e) => {
                error!(
                    "could not convert get_raw_addrman return value back to JSON: {}",
                    e
                );
                return reply::with_status(
                    String::from("INTERNAL_SERVER_ERROR"),
                    StatusCode::INTERNAL_SERVER_ERROR,
                );
            }
        },
        Err(e) => {
            error!("error calling getrawaddrman from Bitcoin Core: {}", e);
            return reply::with_status(
                String::from("INTERNAL_SERVER_ERROR"),
                StatusCode::INTERNAL_SERVER_ERROR,
            );
        }
    }
}

#[tokio::main]
async fn main() {
    env_logger::Builder::from_env(Env::default().default_filter_or("info")).init();

    let config: config::Config = match config::load_config() {
        Ok(config) => {
            info!("Configuration loaded");
            config
        }
        Err(e) => {
            error!("Could not load the configuration: {}", e);
            process::exit(1);
        }
    };

    let proxy = warp::path!(u16).map(move |id: u16| match config.nodes.get(&id) {
        Some(node) => proxy_getrawaddrman(&node),
        None => {
            error!("The node with id={} was requested but not found.", id);
            return reply::with_status(String::from("NOT_FOUND"), StatusCode::NOT_FOUND);
        }
    });

    let proxy_route = proxy
        .map(|reply| warp::reply::with_header(reply, "Access-Control-Allow-Origin", "*"))
        .with(warp::compression::gzip());

    let static_route = warp::fs::dir(config.www_path);

    let route = static_route.or(proxy_route);

    warp::serve(route).run(config.address).await;
}
