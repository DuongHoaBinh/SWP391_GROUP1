# Flow 6: Handover and Trip Acceptance (Optional)

## Actors

Vehicle Driver / Escort, Customer or receiving representative, Logistics Manager

## Main path

1. Driver/escort presents the horse and required documents at the agreed handover location.
2. Receiving party checks horse identity, condition, document set, and delivered quantity.
3. Receiving party confirms acceptance or records an exception with evidence.
4. The system stores the handover time, location, parties, checklist, signature/evidence, and notes.
5. Logistics Manager resolves exceptions and closes the trip when acceptance requirements pass.

**Owner:** `backend/src/modules/tracking` with handover records
