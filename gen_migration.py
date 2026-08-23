import re

with open(r'c:\PrepVista-AI\tpodashboard\part7\drizzle\0000_adorable_toro.sql', 'r', encoding='utf-8') as f:
    sql = f.read()

# Filter out stubs
stubs = ['"application"', '"institution"', '"interview_result"', '"offer"', '"season"', '"skill"', '"student"', '"user_account"']
statements = sql.split('--> statement-breakpoint')
filtered_stmts = []

for stmt in statements:
    stmt = stmt.strip()
    if not stmt:
        continue
    is_stub = False
    for stub in stubs:
        if stmt.startswith(f'CREATE TABLE {stub}'):
            is_stub = True
            break
    if not is_stub:
        # replace 	ext PRIMARY KEY with uuid PRIMARY KEY
        stmt = stmt.replace('"id" text PRIMARY KEY NOT NULL', '"id" uuid PRIMARY KEY NOT NULL')
        # replace 	ext with uuid for all ID references (student_id, institution_id, etc)
        stmt = re.sub(r'("_?id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("student_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("institution_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("season_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("user_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("session_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("cohort_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("program_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("category_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("skill_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("assessment_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("version_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("attempt_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("assignment_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("trainer_user_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("source_cohort_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("training_program_id") text', r'\1 uuid', stmt)
        stmt = re.sub(r'("assessment_version_id") text', r'\1 uuid', stmt)
        
        filtered_stmts.append(stmt)

final_sql = "BEGIN;\n\n" + "\n\n".join(filtered_stmts) + "\n\nCOMMIT;\n"

with open(r'c:\PrepVista-AI\app\database\migrations\029_training_readiness.sql', 'w', encoding='utf-8') as f:
    f.write(final_sql)
print("Migration generated successfully!")