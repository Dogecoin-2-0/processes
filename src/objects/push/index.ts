import PushNotifs from 'node-pushnotifications';
import { GCM_API_KEY } from '../../env';

const settings: PushNotifs.Settings = {
  gcm: {
    id: GCM_API_KEY
  }
};
export default new PushNotifs(settings);
