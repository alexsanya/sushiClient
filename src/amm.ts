import { CHAIN_ID } from "../chains/sepolia";
import { envs } from "./config/env";
import { V3AMMimpl } from "./infrastructure/v3AMM.impl";

(BigInt.prototype as any).toJSON = function () {
    return this.toString();
};

(async function main() {
    if (!envs.USER_PRIVATE_KEY) {
        throw new Error("Private key not provided");
    }
    if (!envs.PROVIDER_RPC) {
        throw new Error("Provider rpc is not defined");
    }

    switch (envs.COMMAND) {
        case 'positions':
            console.log('Active positions:');
            await options();
            break;
        default:
            console.log(`unknown command ${envs.COMMAND}`);
    }

})()

async function options() {
    const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY);
    const positions = await v3Amm.positions();
    console.log(positions);
}