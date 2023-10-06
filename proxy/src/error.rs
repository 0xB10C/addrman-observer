use std::fmt;
use std::net::AddrParseError;
use std::{error, io};

#[derive(Debug)]
pub enum FetchError {
    BitcoinCoreRPC(bitcoincore_rpc::Error),
}

impl fmt::Display for FetchError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            FetchError::BitcoinCoreRPC(e) => write!(f, "Bitcoin Core RPC Error: {}", e),
        }
    }
}

impl error::Error for FetchError {
    fn source(&self) -> Option<&(dyn error::Error + 'static)> {
        match *self {
            FetchError::BitcoinCoreRPC(ref e) => Some(e),
        }
    }
}

impl From<bitcoincore_rpc::Error> for FetchError {
    fn from(e: bitcoincore_rpc::Error) -> Self {
        FetchError::BitcoinCoreRPC(e)
    }
}

#[derive(Debug)]
pub enum ConfigError {
    CookieFileDoesNotExist,
    NoBitcoinCoreRpcAuth,
    NoNodes,
    TomlError(toml::de::Error),
    ReadError(io::Error),
    AddrError(AddrParseError),
}

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            ConfigError::CookieFileDoesNotExist => write!(f, "the .cookie file path set via rpc_cookie_file does not exist"),
            ConfigError::NoBitcoinCoreRpcAuth => write!(f, "please specify a Bitcoin Core RPC .cookie file (option: 'rpc_cookie_file') or a rpc_user and rpc_password"),
            ConfigError::NoNodes => write!(f, "no networks defined in the configuration"),
            ConfigError::TomlError(e) => write!(f, "the TOML in the configuration file could not be parsed: {}", e),
            ConfigError::ReadError(e) => write!(f, "the configuration file could not be read: {}", e),
            ConfigError::AddrError(e) => write!(f, "the address could not be parsed: {}", e),
        }
    }
}

impl error::Error for ConfigError {
    fn source(&self) -> Option<&(dyn error::Error + 'static)> {
        match *self {
            ConfigError::NoBitcoinCoreRpcAuth => None,
            ConfigError::CookieFileDoesNotExist => None,
            ConfigError::NoNodes => None,
            ConfigError::TomlError(ref e) => Some(e),
            ConfigError::ReadError(ref e) => Some(e),
            ConfigError::AddrError(ref e) => Some(e),
        }
    }
}

impl From<io::Error> for ConfigError {
    fn from(err: io::Error) -> ConfigError {
        ConfigError::ReadError(err)
    }
}

impl From<toml::de::Error> for ConfigError {
    fn from(err: toml::de::Error) -> ConfigError {
        ConfigError::TomlError(err)
    }
}

impl From<AddrParseError> for ConfigError {
    fn from(err: AddrParseError) -> ConfigError {
        ConfigError::AddrError(err)
    }
}
