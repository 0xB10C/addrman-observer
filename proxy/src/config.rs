use std::collections::BTreeMap;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::str::FromStr;

use std::{env, fmt, fs};

use bitcoincore_rpc::Auth;
use log::{error, info};
use serde::Deserialize;

use crate::error::ConfigError;

const ENVVAR_CONFIG_FILE: &str = "CONFIG_FILE";
const DEFAULT_CONFIG: &str = "config.toml";

#[derive(Deserialize)]
struct TomlConfig {
    address: String,
    www_path: String,
    nodes: Vec<TomlNode>,
}

#[derive(Clone)]
pub struct Config {
    pub www_path: PathBuf,
    pub address: SocketAddr,
    pub nodes: BTreeMap<String, Node>,
}

#[derive(Debug, Deserialize)]
struct TomlNode {
    id: u16,
    name: String,
    rpc_host: String,
    rpc_port: u16,
    rpc_cookie_file: Option<PathBuf>,
    rpc_user: Option<String>,
    rpc_password: Option<String>,
}

impl fmt::Display for TomlNode {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(
            f,"Node (id={}, name={}, rpc_host='{}', rpc_port={}, rpc_user='{}', rpc_password='***', rpc_cookie_file={:?})",
            self.id,
            self.name,
            self.rpc_host,
            self.rpc_port,
            self.rpc_user.as_ref().unwrap_or(&"".to_string()),
            self.rpc_cookie_file,
        )
    }
}

#[derive(Clone)]
pub struct Node {
    pub id: u16,
    pub name: String,
    pub url: String,
    pub auth: Auth,
}

fn parse_rpc_auth(node_config: &TomlNode) -> Result<Auth, ConfigError> {
    if node_config.rpc_cookie_file.is_some() {
        if let Some(rpc_cookie_file) = node_config.rpc_cookie_file.clone() {
            if !rpc_cookie_file.exists() {
                return Err(ConfigError::CookieFileDoesNotExist);
            }
            return Ok(Auth::CookieFile(rpc_cookie_file));
        }
    } else if let (Some(user), Some(password)) = (
        node_config.rpc_user.clone(),
        node_config.rpc_password.clone(),
    ) {
        return Ok(Auth::UserPass(user, password));
    }
    Err(ConfigError::NoBitcoinCoreRpcAuth)
}

pub fn load_config() -> Result<Config, ConfigError> {
    let config_file_path =
        env::var(ENVVAR_CONFIG_FILE).unwrap_or_else(|_| DEFAULT_CONFIG.to_string());
    info!("Reading configuration file from {}.", config_file_path);
    let config_string = fs::read_to_string(config_file_path)?;
    let toml_config: TomlConfig = toml::from_str(&config_string)?;

    let mut nodes: BTreeMap<String, Node> = BTreeMap::new();
    for toml_node in toml_config.nodes.iter() {
        match parse_toml_node(toml_node) {
            Ok(node) => {
                let id = node.id;
                let name = node.name.clone();
                nodes.insert(id.to_string(), node.clone());
                nodes.insert(name, node);
            }
            Err(e) => {
                error!("Error while parsing a node configuration: {}", toml_node);
                return Err(e);
            }
        }
    }

    if nodes.is_empty() {
        return Err(ConfigError::NoNodes);
    }

    Ok(Config {
        www_path: PathBuf::from(toml_config.www_path),
        address: SocketAddr::from_str(&toml_config.address)?,
        nodes,
    })
}

fn parse_toml_node(toml_node: &TomlNode) -> Result<Node, ConfigError> {
    let node = Node {
        id: toml_node.id,
        name: toml_node.name.clone(),
        auth: parse_rpc_auth(toml_node)?,
        url: format!("{}:{}", toml_node.rpc_host, toml_node.rpc_port),
    };

    Ok(node)
}
