import {test} from '@playwright/test';
import {restartScenario} from './checkout-restart-fixture.js';
test('guest changed issued amount restarts safely',({page,context})=>restartScenario({page,context},false));
