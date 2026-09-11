import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * True when running inside Expo Go rather than a development or store build.
 *
 * Expo Go dropped Android remote push in SDK 53. Touching those APIs there
 * throws during module evaluation, which takes the whole app down before the
 * first screen renders — the error reads "[runtime not ready]" and mentions
 * `addPushTokenListener`, which is not obviously about push at all.
 *
 * Push is a convenience here: a phlebotomist is told about a new job sooner.
 * The Jobs list polls regardless, so skipping registration costs latency, not
 * correctness — and that is a far better trade than an app that will not start
 * in the environment everyone develops in.
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export default isExpoGo;
