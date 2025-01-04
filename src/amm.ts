import { CHAIN_ID } from "../chains/sepolia";
import { envs } from "./config/env";
import { V3AMMimpl } from "./infrastructure/v3AMM.impl";
import { setUpFork } from "./operations/setUpFork";

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
        case 'addLiquidity':
            console.log('Adding liquidity: ');
            await addLiquidity();
            break;
        case 'setUp':
            console.log('Preparing chain fork: ');
            await setUpFork((envs as Record<string, string>).CHAIN_ID);
            console.log('Chain state is ready');
            break;
        default:
            console.log(`unknown command ${envs.COMMAND}`);
    }

})()

async function options() {
    const v3Amm = new V3AMMimpl(CHAIN_ID, envs.USER_PRIVATE_KEY as string);
    const positions = await v3Amm.positions();
    console.log(positions);
}



async function addLiquidity() {

}