use aiken/list
use aiken/std::{script_context}

pub type VerificationRedeemer {
  Submit {
    applicant_hash: ByteArray,
    score: Int,
    reviewer_signatures: List<ByteArray>,
  }
}

fn unique(list: List<ByteArray>) -> Bool {
  let rec aux(remaining: List<ByteArray>, seen: List<ByteArray>) -> Bool {
    remaining.match {
      [] -> true
      [head | tail] ->
        if list.contains(seen, head) {
          false
        } else {
          aux(tail, [head | seen])
        }
    }
  }
  aux(list, [])
}

fn has_quorum(signatures: List<ByteArray>) -> Bool {
  list.length(signatures) >= 3
}

pub fn identity_validator(
  datum: ByteArray,
  redeemer: VerificationRedeemer,
  _ctx: script_context::ScriptContext,
) -> Bool {
  redeemer.match {
    Submit { applicant_hash, score, reviewer_signatures } ->
      datum == applicant_hash && score >= 60 && has_quorum(reviewer_signatures) && unique(reviewer_signatures)
  }
}