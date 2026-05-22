import Types          "types/common";
import Map             "mo:core/Map";

import EvalMixin       "mixins/evaluation-api";
import FileUploadMixin "mixins/file-upload-api";


actor {
  /// Cache: evaluation results keyed by (repo_url | assignment_description)
  let evalCache       = Map.empty<Types.CacheKey, Types.EvaluationResult>();

  /// Cache: parsed assignment keyed by assignment text
  let assignmentCache = Map.empty<Types.CacheKey, Types.ParsedAssignment>();

  /// Track last-hit status for getCacheStats (wrapped to allow mutation in mixin)
  let lastCacheHit = { var value : Bool = false };

  /// Persistent history store — survives canister upgrades via enhanced orthogonal persistence
  let historyStore = Map.empty<Text, Types.EvaluationRecord>();

  /// Monotonically increasing counter — wrapped in a record so the mixin can mutate it.
  /// Ensures unique history IDs even when evaluations arrive in the same nanosecond.
  let evalCounter = { var value : Nat = 0 };

  include EvalMixin(evalCache, assignmentCache, lastCacheHit, historyStore, evalCounter);
  include FileUploadMixin();
};
