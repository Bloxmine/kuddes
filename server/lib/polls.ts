import { z } from 'zod'
import { POLL_LIMITS } from '../../shared/polls'

/** A new poll: a question and 2–6 answers (empty answers are dropped). */
export const pollSchema = z.object({
  question: z.string().trim().min(1, 'Stel een vraag voor je poll.').max(POLL_LIMITS.question, `De vraag mag maximaal ${POLL_LIMITS.question} tekens hebben.`),
  options: z
    .array(z.string().trim().max(POLL_LIMITS.option, `Een antwoord mag maximaal ${POLL_LIMITS.option} tekens hebben.`))
    .transform((o) => o.filter(Boolean))
    .pipe(z.array(z.string()).min(2, 'Een poll heeft minstens 2 antwoorden.').max(POLL_LIMITS.options, `Maximaal ${POLL_LIMITS.options} antwoorden.`)),
})
