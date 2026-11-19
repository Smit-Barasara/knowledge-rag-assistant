"""Golden evaluation dataset for the Indian rail travel guidance RAG corpus."""

EVAL_DATASET = [
    {
        "question": "According to IRCTC guidance, can I cancel an e-ticket after chart preparation?",
        "ground_truth": (
            "The IRCTC guide says an e-ticket can be cancelled online before reservation-chart "
            "preparation. After chart preparation, it directs users to the online TDR process "
            "where applicable. A TDR does not guarantee a refund."
        ),
    },
    {
        "question": "Does filing a TDR guarantee that I will get a refund?",
        "ground_truth": (
            "No. A TDR is a request for review; the refund outcome depends on the applicable "
            "Railway rules and the circumstances of the ticket."
        ),
    },
    {
        "question": "When does the IRCTC Tatkal guide say booking opens?",
        "ground_truth": (
            "The guide describes Tatkal booking as opening one day before the train's departure "
            "date from its originating station, and advises users to verify current timings "
            "directly with IRCTC."
        ),
    },
    {
        "question": "What does the e-ticket guide say to carry after a partial cancellation?",
        "ground_truth": (
            "The IRCTC e-ticket guide says a passenger continuing after a partial cancellation "
            "should carry a fresh Electronic Reservation Slip."
        ),
    },
    {
        "question": "Can this assistant check today's seat availability or PNR status?",
        "ground_truth": (
            "No. The assistant is not connected to live train schedules, seat availability, "
            "PNR status, or ticket booking. Check official IRCTC services for current details."
        ),
    },
]
