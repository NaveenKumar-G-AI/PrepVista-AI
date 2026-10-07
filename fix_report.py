import sys
import re

with open('frontend/src/app/report/[id]/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

target = """        <div className="text-center mb-10 fade-in">
          <p className="text-sm text-secondary mb-2">
            {session.plan.toUpperCase()} Interview - {new Date(session.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          <div
            className="inline-flex items-center justify-center w-28 h-28 rounded-full mb-4"
            style={{ background: `${scoreColor}15`, border: `3px solid ${scoreColor}` }}
          >
            <span className={session.final_score === null ? "text-sm font-semibold" : "text-4xl font-bold"} style={{ color: scoreColor }}>
              <ScoreSummary value={session.final_score} measurement={session} suffix="" />
            </span>
          </div>
          <p className="text-sm text-secondary">
            {session.final_score === null ? 'No score available' : 'out of 100'} - {answeredQuestions} answered out of {expectedQuestions} planned questions
          </p>
          <p className="mt-2 text-sm text-secondary">
            Total time: {durationLabel}{averageAnswerTime ? ` | Avg response: ${averageAnswerTime}s` : ''}
          </p>
          {data.interpretation ? (
            <p className="mt-3 text-sm text-secondary max-w-xl mx-auto">{data.interpretation}</p>
          ) : null}"""

replacement = """        <div className="mb-10 fade-in flex flex-col items-center">
          <p className="text-sm font-semibold text-secondary mb-6 text-center">
            {session.plan.toUpperCase()} Interview - {new Date(session.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          
          <div
            className="flex flex-col items-center justify-center rounded-full mb-8 shrink-0"
            style={{ 
              background: `${scoreColor}10`, 
              border: `4px solid ${scoreColor}`,
              width: 'clamp(140px, 40vw, 180px)',
              height: 'clamp(140px, 40vw, 180px)'
            }}
          >
            <span className={session.final_score === null ? "text-sm sm:text-base font-semibold text-center px-4" : "text-4xl sm:text-5xl font-bold"} style={{ color: scoreColor }}>
              <ScoreSummary value={session.final_score} measurement={session} suffix="" />
            </span>
            {session.final_score !== null && (
              <span className="text-sm font-medium mt-1" style={{ color: scoreColor }}>/ 100</span>
            )}
            <span className="text-xs font-bold uppercase tracking-wider mt-2" style={{ color: scoreColor }}>
              {session.final_score === null ? 'STATUS' : 'SCORE'}
            </span>
          </div>

          <div className="w-full max-w-3xl grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <div className="rounded-lg border border-border bg-surface-secondary p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-wide text-secondary mb-1">Assessed</span>
              <span className="text-base font-semibold text-primary">{session.measurement_coverage?.measured || 0} / {session.measurement_coverage?.asked || 0}</span>
            </div>
            <div className="rounded-lg border border-border bg-surface-secondary p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-wide text-secondary mb-1">Answered</span>
              <span className="text-base font-semibold text-primary">{answeredQuestions} / {expectedQuestions}</span>
            </div>
            <div className="rounded-lg border border-border bg-surface-secondary p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-wide text-secondary mb-1 whitespace-nowrap">No Answer / Skip</span>
              <span className="text-base font-semibold text-primary">{session.measurement_coverage?.intentional || 0}</span>
            </div>
            <div className="rounded-lg border border-border bg-surface-secondary p-4 flex flex-col items-center justify-center text-center">
              <span className="text-xs uppercase tracking-wide text-secondary mb-1">Total Time</span>
              <span className="text-base font-semibold text-primary">{durationLabel}</span>
            </div>
          </div>
          
          <div className="text-center mb-8">
            <MeasurementCoverage measurement={session} expectedQuestions={expectedQuestions} />
          </div>
          
          {averageAnswerTime ? (
            <p className="text-sm text-secondary mb-4">Average response time: {averageAnswerTime}s</p>
          ) : null}

          {data.interpretation ? (
            <p className="text-sm text-secondary max-w-xl mx-auto text-center">{data.interpretation}</p>
          ) : null}"""

if target in content:
    content = content.replace(target, replacement)
    
    if 'import { ScoreSummary }' in content and 'MeasurementCoverage' not in content:
        content = content.replace('import { ScoreSummary }', 'import { ScoreSummary, MeasurementCoverage }')
    
    with open('frontend/src/app/report/[id]/page.tsx', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Replaced successfully.')
else:
    print('Target not found.')
