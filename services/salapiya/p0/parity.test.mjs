import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePhpAmountToMinorUnits,parseMinorUnits,allocateMoneyEvenly,createMoney} from '../../../src/shared/money.ts';

test('the same native golden fixture executes against authoritative web money code',async()=>{
  const fixture=JSON.parse(await readFile(new URL('../../../contracts/salapiya/p0_money.json',import.meta.url),'utf8'));
  for(const [input,expected] of Object.entries(fixture.php)) assert.equal(parsePhpAmountToMinorUnits(input).toString(),expected);
  for(const input of fixture.invalidPhp) assert.throws(()=>parsePhpAmountToMinorUnits(input));
  for(const input of fixture.invalidMinor) assert.throws(()=>parseMinorUnits(input));
  for(const row of fixture.allocations) assert.deepEqual(allocateMoneyEvenly(createMoney('PHP',BigInt(row.total)),row.count).map(m=>m.amountMinor.toString()),row.parts);
});
