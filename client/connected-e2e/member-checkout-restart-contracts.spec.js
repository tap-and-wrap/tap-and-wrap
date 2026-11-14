import {test} from '@playwright/test';
import {restartScenario} from './checkout-restart-fixture.js';
test('member changed issued amount restarts safely',({page,context})=>restartScenario({page,context},true));
