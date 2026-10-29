// Public deployment identities, never credentials. Development cannot silently
// connect to a future pilot. A pilot build requires an explicitly paired config.
const developmentProject = 'uxnyxhwqshqpvinvopiv';
const developmentSyncInstance = '6adc9162b32a60a89a2e706c';

bool allowedConnectionEnvironment({
  required String environment,
  required String url,
  required String endpoint,
  required String project,
  required String syncInstance,
}) {
  if (!RegExp(r'^[a-z]{20}$').hasMatch(project) ||
      !RegExp(r'^[0-9a-f]{24}$').hasMatch(syncInstance)) {
    return false;
  }
  if (environment == 'development') {
    if (project != developmentProject ||
        syncInstance != developmentSyncInstance) {
      return false;
    }
  } else if (environment == 'pilot') {
    if (project == developmentProject ||
        syncInstance == developmentSyncInstance) {
      return false;
    }
  } else {
    return false;
  }
  return url == 'https://$project.supabase.co' &&
      endpoint == 'https://$syncInstance.powersync.journeyapps.com';
}
