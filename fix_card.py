import sys

with open('frontend/src/app/report/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """      <div className="max-w-3xl mx-auto px-6 py-10">
        {data.terminal_answer_records?.filter(record => record.outcome !== 'EVALUATED' || record.evaluation_state !== 'COMPLETE').map(record => (
          <div key={record.question_instance_id} className="mb-4 rounded-xl border p-4 text-sm">
            <p className="font-semibold">Question {record.turn}: {record.question_text}</p>
            <p>{record.evaluation_state === 'PENDING' ? 'Evaluation pending. This answer has not been scored.'
              : record.evaluation_state === 'UNAVAILABLE' ? 'Evaluation unavailable. This answer has not been scored.'
              : record.outcome === 'TRANSCRIPTION_FAILED' ? 'Transcription could not be completed. This question was not scored.'
              : record.outcome === 'UNINTELLIGIBLE' ? 'No usable transcript was available. This question was not scored.'
              : record.outcome === 'ABORTED' ? 'The interview ended before this answer was completed. This question was not scored.'
              : record.outcome === 'SKIPPED' ? 'Question skipped.' : 'No answer provided.'}</p>
          </div>
        ))}"""

replacement = """      <div className="max-w-3xl mx-auto px-6 py-10">
        {data.terminal_answer_records?.filter(record => record.outcome !== 'EVALUATED' || record.evaluation_state !== 'COMPLETE').map(record => (
          <div key={record.question_instance_id} className="mb-8 rounded-xl border border-border bg-surface-primary overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border/50 bg-surface-secondary/50">
              <p className="text-xs font-bold uppercase tracking-wider text-secondary mb-3">Question {record.turn}</p>
              <p className="text-sm md:text-base leading-relaxed text-primary break-words whitespace-pre-wrap">{record.question_text}</p>
            </div>
            <div className="p-5 bg-surface-primary">
              <p className="text-xs font-bold uppercase tracking-wider text-secondary mb-3">Response</p>
              <p className="text-sm md:text-base text-secondary italic">
                {record.evaluation_state === 'PENDING' ? 'Evaluation pending. This answer has not been scored.'
                : record.evaluation_state === 'UNAVAILABLE' ? 'Evaluation unavailable. This answer has not been scored.'
                : record.outcome === 'TRANSCRIPTION_FAILED' ? 'Transcription could not be completed. This question was not scored.'
                : record.outcome === 'UNINTELLIGIBLE' ? 'No usable transcript was available. This question was not scored.'
                : record.outcome === 'ABORTED' ? 'The interview ended before this answer was completed. This question was not scored.'
                : record.outcome === 'SKIPPED' ? 'Question skipped.' : 'No answer provided.'}
              </p>
            </div>
          </div>
        ))}"""

if target in content:
    content = content.replace(target, replacement)
    with open('frontend/src/app/report/[id]/page.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Terminal answer card replaced successfully.')
else:
    print('Terminal answer target not found.')
