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
pub const MAX_NAME_LENGTH: usize = 32;

#[derive(Deserialize)]
struct TomlConfig {
    address: String,
    www_path: String,
    nodes: Vec<TomlNode>,
}

#[derive(Clone, Debug)]
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

#[derive(Clone, Debug)]
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

pub(crate) fn parse_config(config_string: &str) -> Result<Config, ConfigError> {
    let toml_config: TomlConfig = toml::from_str(config_string)?;

    let mut nodes: BTreeMap<String, Node> = BTreeMap::new();
    for toml_node in toml_config.nodes.iter() {
        match parse_toml_node(toml_node) {
            Ok(node) => {
                let id = node.id;
                let name = node.name.clone();
                if name.len() > MAX_NAME_LENGTH {
                    error!(
                        "The node with id={} has a name longer {}.",
                        id, MAX_NAME_LENGTH
                    );
                    return Err(ConfigError::NodeNameTooLong);
                }
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

pub fn load_config() -> Result<Config, ConfigError> {
    let config_file_path =
        env::var(ENVVAR_CONFIG_FILE).unwrap_or_else(|_| DEFAULT_CONFIG.to_string());
    info!("Reading configuration file from {}.", config_file_path);
    let config_string = fs::read_to_string(config_file_path)?;
    parse_config(&config_string)
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

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_userpass_toml() -> String {
        r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
            rpc_user = "user"
            rpc_password = "pass"
        "#
        .to_string()
    }

    // Userpass auth parses correctly; node accessible by both ID and name.
    #[test]
    fn test_parse_valid_config_userpass() {
        let config = parse_config(&valid_userpass_toml()).unwrap();
        assert_eq!(
            config.address,
            SocketAddr::from_str("127.0.0.1:8080").unwrap()
        );
        assert_eq!(config.www_path, PathBuf::from("/tmp/www"));

        // Accessible by ID
        let by_id = config
            .nodes
            .get("0")
            .expect("node should be accessible by id");
        assert_eq!(by_id.id, 0);
        assert_eq!(by_id.name, "alice");

        // Accessible by name
        let by_name = config
            .nodes
            .get("alice")
            .expect("node should be accessible by name");
        assert_eq!(by_name.id, 0);

        // Auth is UserPass
        assert!(matches!(by_id.auth, Auth::UserPass(_, _)));
    }

    // Cookie file auth resolves to Auth::CookieFile when the file exists on disk.
    #[test]
    fn test_parse_valid_config_cookie() {
        let cookie = tempfile::NamedTempFile::new().unwrap();
        let cookie_path = cookie.path().to_str().unwrap();

        let toml = format!(
            r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
            rpc_cookie_file = "{}"
            "#,
            cookie_path
        );

        let config = parse_config(&toml).unwrap();
        let node = config.nodes.get("0").unwrap();
        assert!(matches!(node.auth, Auth::CookieFile(_)));
    }

    // Two nodes produce 4 BTreeMap entries (id + name key for each).
    #[test]
    fn test_parse_multiple_nodes() {
        let toml = r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
            rpc_user = "user1"
            rpc_password = "pass1"
            [[nodes]]
            id = 1
            name = "bob"
            rpc_host = "127.0.0.1"
            rpc_port = 18332
            rpc_user = "user2"
            rpc_password = "pass2"
        "#;

        let config = parse_config(toml).unwrap();
        assert!(config.nodes.contains_key("0"));
        assert!(config.nodes.contains_key("alice"));
        assert!(config.nodes.contains_key("1"));
        assert!(config.nodes.contains_key("bob"));
        assert_eq!(config.nodes.len(), 4); // 2 nodes x 2 keys each
    }

    // Node URL is formatted as http://{host}:{port}.
    #[test]
    fn test_node_url_format() {
        let config = parse_config(&valid_userpass_toml()).unwrap();
        let node = config.nodes.get("0").unwrap();
        assert_eq!(node.url, "127.0.0.1:8332");
    }

    // Empty nodes array is rejected.
    #[test]
    fn test_parse_no_nodes() {
        let toml = r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            nodes = []
        "#;

        let err = parse_config(toml).unwrap_err();
        assert_eq!(err, ConfigError::NoNodes);
    }

    // Node name exceeding MAX_NAME_LENGTH (32) is rejected.
    #[test]
    fn test_parse_name_too_long() {
        let long_name = "a".repeat(MAX_NAME_LENGTH + 1);
        let toml = format!(
            r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "{}"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
            rpc_user = "user"
            rpc_password = "pass"
            "#,
            long_name
        );

        let err = parse_config(&toml).unwrap_err();
        assert_eq!(err, ConfigError::NodeNameTooLong);
    }

    // Node with neither cookie nor user/pass is rejected.
    #[test]
    fn test_parse_no_auth() {
        let toml = r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
        "#;

        let err = parse_config(toml).unwrap_err();
        assert_eq!(err, ConfigError::NoBitcoinCoreRpcAuth);
    }

    // Nonexistent cookie file path is rejected.
    #[test]
    fn test_parse_cookie_file_missing() {
        let toml = r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
            rpc_cookie_file = "/nonexistent/path/.cookie"
        "#;

        let err = parse_config(toml).unwrap_err();
        assert_eq!(err, ConfigError::CookieFileDoesNotExist);
    }

    // Unparseable SocketAddr is rejected.
    #[test]
    fn test_parse_invalid_address() {
        let toml = r#"
            address = "not_an_address"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
            rpc_user = "user"
            rpc_password = "pass"
        "#;

        let err = parse_config(toml).unwrap_err();
        assert!(matches!(err, ConfigError::AddrError(_)));
    }

    // Duplicate node names: second node silently overwrites the first in the BTreeMap.
    #[test]
    fn test_parse_duplicate_name_overwrites() {
        let toml = r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
            rpc_user = "user1"
            rpc_password = "pass1"
            [[nodes]]
            id = 1
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 18332
            rpc_user = "user2"
            rpc_password = "pass2"
        "#;

        let config = parse_config(toml).unwrap();
        // "alice" key holds the second node (id=1), first was overwritten
        let node = config.nodes.get("alice").unwrap();
        assert_eq!(node.id, 1);
        // 3 keys: "0", "1", "alice" (not 4, because "alice" was inserted twice)
        assert_eq!(config.nodes.len(), 3);
    }

    // Duplicate node IDs: second node silently overwrites the first in the BTreeMap.
    #[test]
    fn test_parse_duplicate_id_overwrites() {
        let toml = r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
            rpc_user = "user1"
            rpc_password = "pass1"
            [[nodes]]
            id = 0
            name = "bob"
            rpc_host = "127.0.0.1"
            rpc_port = 18332
            rpc_user = "user2"
            rpc_password = "pass2"
        "#;

        let config = parse_config(toml).unwrap();
        // "0" key holds the second node (name=bob), first was overwritten
        let node = config.nodes.get("0").unwrap();
        assert_eq!(node.name, "bob");
        // 3 keys: "0", "alice", "bob" (not 4, because "0" was inserted twice)
        assert_eq!(config.nodes.len(), 3);
    }

    // rpc_user without rpc_password (and vice versa) is rejected.
    #[test]
    fn test_parse_partial_userpass_rejected() {
        // user without password
        let toml_user_only = r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
            rpc_user = "user"
        "#;

        let err = parse_config(toml_user_only).unwrap_err();
        assert_eq!(err, ConfigError::NoBitcoinCoreRpcAuth);

        // password without user
        let toml_pass_only = r#"
            address = "127.0.0.1:8080"
            www_path = "/tmp/www"
            [[nodes]]
            id = 0
            name = "alice"
            rpc_host = "127.0.0.1"
            rpc_port = 8332
            rpc_password = "pass"
        "#;

        let err = parse_config(toml_pass_only).unwrap_err();
        assert_eq!(err, ConfigError::NoBitcoinCoreRpcAuth);
    }

    // Malformed TOML string is rejected.
    #[test]
    fn test_parse_invalid_toml() {
        let err = parse_config("this is not valid toml {{{").unwrap_err();
        assert!(matches!(err, ConfigError::TomlError(_)));
    }
}
