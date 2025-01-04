import 'dotenv/config';
import commandLineArgs from "command-line-args";
import { get } from 'env-var';



const optionDefinitions = [
    { name: 'command', defaultOption: true },
    { name: 'privateKey', alias: 'p', type: String },
    { name: 'rpcUrl', aliac: 'r', type: String }
];

const { command, privateKey, rpcUrl } =  commandLineArgs(optionDefinitions);

export const envs = {
    COMMAND: command,
    PROVIDER_RPC: rpcUrl || get('PROVIDER_RPC').asString(),
    USER_PRIVATE_KEY: (privateKey|| get('USER_PRIVATE_KEY').asString())
}