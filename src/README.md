
# SushiSwap V3 console client

Console client for SushiSwap V3 liquidity protocol

## Screencast
[ to be added]

## Requirements
 To launch project you need to set following environment variables:
 - `PROVIDER_RPC` - PRC Url for blockchain data provider
 - `USER_PRIVATE_KEY` - Private key for user wallet

## Tests
Integration tests are run against Sepolia network. To launch them follow instructions:
- Start local fork of Sepolia: `anvil --fork-url $PROVIDER_RPC --chain-id 11155111`
- Configure environment variables from previous chapter
- Run `npm run test`

## Usage with Binance Smart Chain
You can use this client to work with BSC. Following commands are availible:
- Show liquidity positions: `node dist/src/amm.js  positions -c bsc`
- Add liquidity: `node dist/src/amm.js addLiquidity -c bsc`
- Withdraw liquidity `node dist/src/amm.js withdrawLiquidity -i 0 -c bsc`
- Collect fees `node dist/src/amm.js  collectAllFees -t 1056 -c bsc`
- Reallocate liquidity: `node dist/src/amm.js reallocate -i 0 -c bsc`
Keep in mind that before operations with liquidity you have to approve tokens to NonFungiblePositionManager contract

## Usage with Sepolia network
For sepolia network there is a special `setUp` command that will do all operations like token transfers and approvals: ` node dist/src/amm.js setUp -c sepolia`

## Command line parameters
- Position index alias: `-i ` - the number of position in array - used for withdraw and reallocate operations
- Private key alias: `-p` - the private key of signer - could be used with any command - overrides environment variable `USER_PRIVATE_KEY`
- rpc Url alias `-r` - url of rpc endpoint, could be used with any command - overrides environment variable `PROVIDER_RPC`
- chain alias `-c` - either `sepolia` or `bsc` required with any command
- Token id alias `-t` NFT token id of liquidity position - used with `collectAllFees` command
