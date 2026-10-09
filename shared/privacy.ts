/**
 * The privacy statement (src/pages/PrivacyPage.tsx). New members agree to it
 * when signing up; the version they agreed to is kept with their account
 * (users.privacy_version). Change the version when the statement changes in
 * a way that matters.
 */
// A second change on the same day gets a time, so members who agreed this morning are asked again
export const PRIVACY_VERSION = '2026-10-09T12:00'

/**
 * The user agreement (src/pages/UserAgreementPage.tsx), agreed to together
 * with the privacy statement when signing up. Change the version when the
 * rules change in a way that matters.
 */
export const TERMS_VERSION = '2026-10-09T12:00'

/**
 * What members agree to: the newer of the two dates above. It's what's kept in
 * users.privacy_version, so a change to either statement asks everyone to
 * agree again (ConsentGate.tsx).
 */
export const CONSENT_VERSION = PRIVACY_VERSION > TERMS_VERSION ? PRIVACY_VERSION : TERMS_VERSION

/** The minimum age to sign up without a parent's permission (AVG art. 8, UAVG art. 5). */
export const MIN_AGE = 16
