import {maintenanceEnabled} from './src/ui/maintenance-config.js';
import {showMaintenance} from './src/ui/maintenance.js';
if(maintenanceEnabled){
 showMaintenance(document);
}else{
 const {createAccountStorage,routeAccountStorageEvents}=await import('./account-storage.js');
 const {installKingdomRuntime}=await import('./i3-runtime.js');
 window.becomingStorage=createAccountStorage(window.localStorage);routeAccountStorageEvents(window,window.becomingStorage);installKingdomRuntime();await import('./auth.js');
}
