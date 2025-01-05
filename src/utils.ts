import type JSBI from 'jsbi';
import { MINUS_ONE, PRICE_PRECISION, TICK_MATH_BASE } from './constants';

export function getPriceFromTick(tick: JSBI): string {
	return Math.pow(TICK_MATH_BASE, MINUS_ONE * Number(tick))
		.toFixed(PRICE_PRECISION)
		.toString();
}
