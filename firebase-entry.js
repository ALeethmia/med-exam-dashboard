import {createAccountStorage,routeAccountStorageEvents} from './account-storage.js';
import {installKingdomRuntime} from './i3-runtime.js';
window.becomingStorage=createAccountStorage(window.localStorage);routeAccountStorageEvents(window,window.becomingStorage);installKingdomRuntime();await import('./auth.js');
