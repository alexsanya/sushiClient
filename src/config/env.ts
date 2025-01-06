import 'dotenv/config';
import commandLineArgs from 'command-line-args';
import { get } from 'env-var';
import { CHAIN_ID as SEPOLIA_CHAIN_ID } from '../chains/sepolia';
import { CHAIN_ID as BSC_CHAIN_ID } from '../chains/bsc';

const optionDefinitions = [
	{ name: 'command', defaultOption: true },
	{ name: 'positionIndex', alias: 'i', type: Number },
	{ name: 'privateKey', alias: 'p', type: String },
	{ name: 'rpcUrl', alias: 'r', type: String },
	{ name: 'chain', alias: 'c', type: String },
	{ name: 'tokenId', alias: 't', type: Number }
];

const mainOptions = commandLineArgs(optionDefinitions);
const { command, privateKey, rpcUrl, chain, positionIndex, tokenId } = mainOptions;

const additionalOptions: Record<string, unknown> = {};
switch (chain) {
	case 'sepolia':
		additionalOptions.CHAIN_ID = SEPOLIA_CHAIN_ID;
		break;
	case 'bsc':
		additionalOptions.CHAIN_ID = BSC_CHAIN_ID;
		console.log({ additionalOptions });
		break;
	default:
		additionalOptions.CHAIN_ID = SEPOLIA_CHAIN_ID;
	// throw new Error(`Unknown chain ${chain}`);
}

export const envs = {
	COMMAND: command,
	TOKEN_ID: tokenId,
	POSITION_INDEX: positionIndex,
	PROVIDER_RPC: rpcUrl || get('PROVIDER_RPC').asString(),
	USER_PRIVATE_KEY: privateKey || get('USER_PRIVATE_KEY').asString(),
	...additionalOptions
};
