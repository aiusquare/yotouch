use aiken/test
use aiken/std::{script_context}
use validators/identity_validator

test "valid redeemer passes" {
  let datum = #0011
  let redeemer = identity_validator::VerificationRedeemer::Submit {
    applicant_hash: datum,
    score: 80,
    reviewer_signatures: [#aa, #bb],
  }

  identity_validator::identity_validator(datum, redeemer, script_context::dummy())
}
