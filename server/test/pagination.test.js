import test from 'node:test';import assert from 'node:assert/strict';
import {getPagination} from '../src/utils/pagination.js';
test('20 items per page',()=>{assert.deepEqual(getPagination(1),{page:1,limit:20,skip:0});assert.deepEqual(getPagination(3),{page:3,limit:20,skip:40});});
test('invalid page rejected',()=>{assert.throws(()=>getPagination(0));assert.throws(()=>getPagination('2.5'));});
