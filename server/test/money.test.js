import test from 'node:test';import assert from 'node:assert/strict';
import {shippingPiastres,calculateTotal,assertPiastres} from '../src/utils/money.js';
test('90 EGP Cairo/Giza and 120 EGP other governorates',()=>{
 assert.equal(shippingPiastres('Cairo'),9000); assert.equal(shippingPiastres('giza'),9000); assert.equal(shippingPiastres('Alexandria'),12000);
});
test('exact integer piastre pricing',()=>assert.equal(calculateTotal({subtotalPiastres:65000,extrasPiastres:10000,shippingPiastres:9000,discountPiastres:5000}),79000));
test('invalid monetary input rejected',()=>{assert.throws(()=>assertPiastres(50.5));assert.throws(()=>calculateTotal({subtotalPiastres:100,discountPiastres:1000}));});
