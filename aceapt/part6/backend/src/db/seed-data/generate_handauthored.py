"""
Hand-authored DATA_INTERPRETATION / ANALYTICAL_REASONING / GRAMMAR /
READING_COMPREHENSION questions. Numeric DI answers are still computed in
code (not typed as literals) so arithmetic is verified; reasoning/grammar/RC
answers are logic that was checked by hand and is cross-checked here only for
structural integrity (exactly one correct option, no duplicate option text).
All reading passages are original text written for this project.
"""
import json
from datetime import datetime, timezone

NOW = datetime.now(timezone.utc).isoformat()
questions = []


def opt(a, b, c, d):
    return [
        {"id": "A", "text": str(a)},
        {"id": "B", "text": str(b)},
        {"id": "C", "text": str(c)},
        {"id": "D", "text": str(d)},
    ]


def add(qid, domain, topic, skill, difficulty, prompt, options, correct_text, explanation, expected_time, tags, context=None):
    texts = [o["text"] for o in options]
    assert len(set(texts)) == len(texts), f"{qid}: duplicate option text {texts}"
    matches = [o["id"] for o in options if o["text"] == str(correct_text)]
    assert len(matches) == 1, f"{qid}: correct answer {correct_text!r} must appear exactly once in {texts}"
    q = {
        "id": qid, "domain": domain, "topic": topic, "skill": skill, "difficulty": difficulty,
        "prompt": prompt, "options": options, "correctOptionId": matches[0], "explanation": explanation,
        "expectedTimeSeconds": expected_time, "health": "HEALTHY", "tags": tags, "createdAt": NOW,
    }
    if context:
        q["context"] = context
    questions.append(q)


# ============================================================================
# DATA_INTERPRETATION (8) - two small datasets, verified arithmetic
# ============================================================================

sales_ctx = ("Monthly sales of a store (Rs. thousands):\n"
             "Jan: 120 | Feb: 150 | Mar: 90 | Apr: 180 | May: 200 | Jun: 160")
sales = {"Jan": 120, "Feb": 150, "Mar": 90, "Apr": 180, "May": 200, "Jun": 160}

add("di_001", "QUANTITATIVE", "DATA_INTERPRETATION", "table-reading", "EASY",
    "Based on the table, in which month was sales highest?", opt("April", "June", "February", "May"), "May",
    "May had sales of 200 (thousand), the highest value in the table.", 60, ["data-interpretation"], sales_ctx)

mar_apr_pct = (sales["Apr"] - sales["Mar"]) * 100 // sales["Mar"]
assert mar_apr_pct == 100
add("di_002", "QUANTITATIVE", "DATA_INTERPRETATION", "percentage-change", "MEDIUM",
    "What is the percentage increase in sales from March to April?",
    opt("50%", "80%", f"{mar_apr_pct}%", "120%"), f"{mar_apr_pct}%",
    f"Increase = 180-90 = 90. % increase = (90/90) x 100 = {mar_apr_pct}%.", 90, ["data-interpretation", "percentages"],
    sales_ctx)

avg_sales = sum(sales.values()) // len(sales)
assert avg_sales == 150
add("di_003", "QUANTITATIVE", "DATA_INTERPRETATION", "averages", "MEDIUM_PLUS",
    "What is the average monthly sales over the six months shown?", opt(140, 145, avg_sales, 160), avg_sales,
    f"Total = {sum(sales.values())}. Average = {sum(sales.values())}/6 = {avg_sales}.", 120,
    ["data-interpretation", "averages"], sales_ctx)

q2_sum = sales["Apr"] + sales["May"] + sales["Jun"]
total = sum(sales.values())
q2_share = q2_sum * 100 // total
assert q2_share == 60
add("di_004", "QUANTITATIVE", "DATA_INTERPRETATION", "percentage-share", "HARD",
    "What percentage of the total half-year sales came from Apr-Jun (Q2)?",
    opt("50%", "55%", "65%", f"{q2_share}%"), f"{q2_share}%",
    f"Apr+May+Jun = {q2_sum}. Total = {total}. Share = {q2_sum}/{total} x 100 = {q2_share}%.", 150,
    ["data-interpretation", "percentages"], sales_ctx)

runs_ctx = "Runs scored by 5 batsmen in a match:\nA: 45 | B: 62 | C: 38 | D: 71 | E: 54"
runs = {"A": 45, "B": 62, "C": 38, "D": 71, "E": 54}

add("di_005", "QUANTITATIVE", "DATA_INTERPRETATION", "table-reading", "EASY",
    "Who scored the most runs?", opt("B", "E", "A", "D"), "D",
    "D scored 71 runs, the highest total in the table.", 55, ["data-interpretation"], runs_ctx)

total_runs = sum(runs.values())
assert total_runs == 270
add("di_006", "QUANTITATIVE", "DATA_INTERPRETATION", "totals", "MEDIUM",
    "What is the total runs scored by all 5 batsmen combined?",
    opt(260, 280, 250, total_runs), total_runs,
    f"45+62+38+71+54 = {total_runs}.", 85, ["data-interpretation"], runs_ctx)

d_share_pct = round(runs["D"] / total_runs * 100)
assert d_share_pct == 26
add("di_007", "QUANTITATIVE", "DATA_INTERPRETATION", "percentage-share", "MEDIUM_PLUS",
    "What percentage of the total runs did batsman D score (rounded to the nearest whole percent)?",
    opt("25%", "28%", "30%", f"{d_share_pct}%"), f"{d_share_pct}%",
    f"D's share = 71/270 x 100 = {runs['D']/total_runs*100:.2f}%, which rounds to {d_share_pct}%.", 120,
    ["data-interpretation", "percentages"], runs_ctx)

new_total_runs = total_runs + 15
new_avg = new_total_runs // 5
assert new_avg == 57
add("di_008", "QUANTITATIVE", "DATA_INTERPRETATION", "averages", "HARD",
    "If batsman C had scored 15 more runs, what would the new average of all 5 batsmen be?",
    opt(54, 60, 52, new_avg), new_avg,
    f"New total = 270+15 = {new_total_runs}. New average = {new_total_runs}/5 = {new_avg}.", 150,
    ["data-interpretation", "averages"], runs_ctx)

# ============================================================================
# ANALYTICAL_REASONING (8)
# ============================================================================

add("ar_001", "LOGICAL", "ANALYTICAL_REASONING", "arrangement", "EASY",
    "In a queue, Meera is standing 5th from the front and 8th from the end. How many people are in the queue?",
    opt(13, 11, 14, 12), 12,
    "Total = (position from front) + (position from end) - 1 = 5 + 8 - 1 = 12.", 60, ["arrangement"])

add("ar_002", "LOGICAL", "ANALYTICAL_REASONING", "comparison", "EASY",
    "Ravi is older than Suman. Suman is older than Kiran. Who is the youngest?",
    opt("Ravi", "Suman", "Kiran", "Cannot be determined"), "Kiran",
    "Ravi > Suman > Kiran in age, so Kiran is the youngest.", 50, ["comparison", "ordering"])

add("ar_003", "LOGICAL", "ANALYTICAL_REASONING", "arrangement", "MEDIUM",
    "Four friends P, Q, R, S sit in a row. P is immediately left of Q. R is immediately right of S. "
    "S is at the leftmost end, and R is immediately left of P. What is the order from left to right?",
    opt("P, Q, R, S", "S, R, Q, P", "Q, R, S, P", "S, R, P, Q"), "S, R, P, Q",
    "S is leftmost (position 1). R is immediately right of S, so R is position 2. R is immediately left of P, "
    "so P is position 3. P is immediately left of Q, so Q is position 4. Order: S, R, P, Q.", 100, ["arrangement", "seating"])

add("ar_004", "LOGICAL", "ANALYTICAL_REASONING", "direction-sense", "MEDIUM",
    "Anu walks 5 km North, turns right and walks 3 km, then turns right again and walks 5 km. "
    "How far is she from her starting point?",
    opt("5 km", "8 km", "10 km", "3 km"), "3 km",
    "North 5km to (0,5); turn right (now facing East) 3km to (3,5); turn right again (now facing South) 5km to (3,0). "
    "Distance from (0,0) to (3,0) = 3 km.", 100, ["direction-sense"])

add("ar_005", "LOGICAL", "ANALYTICAL_REASONING", "blood-relations", "MEDIUM_PLUS",
    "Pointing to a photograph, Rahul said, 'She is the daughter of my grandfather's only son.' "
    "How is the woman in the photograph related to Rahul?",
    opt("Daughter", "Mother", "Cousin", "Sister"), "Sister",
    "Rahul's grandfather's only son is Rahul's father. The daughter of Rahul's father is Rahul's sister.", 110,
    ["blood-relations"])

add("ar_006", "LOGICAL", "ANALYTICAL_REASONING", "ranking", "MEDIUM_PLUS",
    "In a class test, Aditi scored higher than Bala. Chetan scored lower than Bala but higher than Deepa. "
    "Who scored the lowest?",
    opt("Chetan", "Bala", "Aditi", "Deepa"), "Deepa",
    "Order from highest to lowest: Aditi > Bala > Chetan > Deepa, so Deepa scored the lowest.", 100, ["ranking"])

add("ar_007", "LOGICAL", "ANALYTICAL_REASONING", "arrangement", "HARD",
    "Six students J, K, L, M, N, O are ranked 1st to 6th in an exam, with no ties. J is ranked immediately "
    "above K. L is ranked 3rd. M is ranked immediately below N. O is ranked last (6th). If K is ranked 2nd, "
    "what is N's rank?",
    opt("5th", "3rd", "6th", "4th"), "4th",
    "K=2nd, and J immediately above K means J=1st. L=3rd and O=6th are fixed. The remaining ranks 4 and 5 go "
    "to N and M. Since M is immediately below N, N=4th and M=5th.", 150, ["arrangement", "ranking"])

add("ar_008", "LOGICAL", "ANALYTICAL_REASONING", "coding-decoding", "HARD",
    "In a certain code, 'PEN' is written as 'QFO' and 'BOOK' is written as 'CPPL'. "
    "How would 'DESK' be written in that code?",
    opt("EFTM", "DFTL", "EFUL", "EFTL"), "EFTL",
    "Each letter is shifted forward by one position in the alphabet (P->Q, E->F, N->O; B->C, O->P, O->P, K->L). "
    "Applying the same rule: D->E, E->F, S->T, K->L, giving EFTL.", 150, ["coding-decoding"])

# ============================================================================
# GRAMMAR (10)
# ============================================================================

add("gram_001", "VERBAL", "GRAMMAR", "subject-verb-agreement", "EASY",
    "Choose the correct sentence.",
    opt("She go to school every day.", "She goes to school every day.",
        "She going to school every day.", "She gone to school every day."),
    "She goes to school every day.",
    "Third-person singular subjects ('she') take the -s verb form in the simple present tense: 'goes'.", 40,
    ["subject-verb-agreement"])

add("gram_002", "VERBAL", "GRAMMAR", "subject-verb-agreement", "EASY",
    "Fill in the blank: He ___ a doctor.", opt("am", "is", "are", "be"), "is",
    "The singular subject 'He' takes the singular verb 'is'.", 35, ["subject-verb-agreement"])

add("gram_003", "VERBAL", "GRAMMAR", "spelling", "EASY",
    "Choose the correctly spelled word.", opt("Recieve", "Receive", "Receve", "Receeve"), "Receive",
    "The correct spelling follows 'i before e except after c' is a common (imperfect) rule, but the correct "
    "spelling here is simply 'Receive'.", 35, ["spelling"])

add("gram_004", "VERBAL", "GRAMMAR", "prepositions", "MEDIUM",
    "Choose the correct preposition: She is good ___ mathematics.", opt("in", "at", "on", "with"), "at",
    "The standard idiom is 'good at' a subject or skill.", 60, ["prepositions"])

add("gram_005", "VERBAL", "GRAMMAR", "subject-verb-agreement", "MEDIUM",
    "Identify the correct sentence.",
    opt("Neither of the boys were present.", "Neither of the boys was present.",
        "Neither of the boys are present.", "Neither of the boys is being present."),
    "Neither of the boys was present.",
    "'Neither' is grammatically singular, so it takes the singular verb 'was'.", 75, ["subject-verb-agreement"])

add("gram_006", "VERBAL", "GRAMMAR", "subjunctive-mood", "MEDIUM",
    "Choose the correct form: If I ___ you, I would apologize.", opt("am", "was", "were", "be"), "were",
    "The subjunctive mood for hypothetical 'if' clauses uses 'were' regardless of subject: 'If I were you'.", 75,
    ["subjunctive-mood"])

add("gram_007", "VERBAL", "GRAMMAR", "subject-verb-agreement", "MEDIUM_PLUS",
    "Choose the sentence with correct subject-verb agreement.",
    opt("The number of students have increased.", "The number of students has increased.",
        "The number of students increasing.", "The number of students were increased."),
    "The number of students has increased.",
    "'The number of' (referring to the number itself) takes a singular verb: 'has increased'. "
    "(Contrast with 'A number of students have increased', which is plural.)", 100, ["subject-verb-agreement"])

add("gram_008", "VERBAL", "GRAMMAR", "subject-verb-agreement", "MEDIUM_PLUS",
    "Choose the correct sentence.",
    opt("Neither the manager nor the employees was informed.", "Neither the manager nor the employees were informed.",
        "Neither the manager nor the employees is informed.", "Neither the manager nor the employees be informed."),
    "Neither the manager nor the employees were informed.",
    "In 'neither...nor' constructions, the verb agrees with the subject closer to it - here, the plural "
    "'employees', so 'were' is correct.", 100, ["subject-verb-agreement"])

add("gram_009", "VERBAL", "GRAMMAR", "subjunctive-mood", "HARD",
    "Choose the sentence that correctly uses the subjunctive mood.",
    opt("I wish I was taller.", "I wish I were taller.", "I wish I am taller.", "I wish I will be taller."),
    "I wish I were taller.",
    "Formal English uses the subjunctive 'were' (not 'was') for hypothetical wishes, regardless of subject.", 130,
    ["subjunctive-mood"])

add("gram_010", "VERBAL", "GRAMMAR", "word-choice", "HARD",
    "Identify the sentence with the correct use of 'lay' vs 'lie'.",
    opt("I am going to lay down for a nap.", "I am going to lie down for a nap.",
        "I am going to lied down for a nap.", "I am going to laid down for a nap."),
    "I am going to lie down for a nap.",
    "'Lie' (lie/lay/lain) means to recline and takes no direct object. 'Lay' (lay/laid/laid) requires a direct "
    "object, e.g. 'lay the book down'. Since there is no object here, 'lie down' is correct.", 130, ["word-choice"])

# ============================================================================
# READING_COMPREHENSION (9) - 3 original passages, 3 questions each
# ============================================================================

passage_bees = (
    "Honeybees play a vital role in pollinating flowering plants, including many of the crops that end up on "
    "our dinner tables. As a bee visits a flower to collect nectar, grains of pollen stick to the fine hairs "
    "covering its body. When the bee moves to the next flower, some of this pollen rubs off, fertilizing the "
    "plant. Without this transfer, many plants would be unable to produce fruit or seeds. In recent decades, "
    "beekeepers have reported unusually high losses of honeybee colonies, a phenomenon linked to pesticide "
    "exposure, habitat loss, and parasitic mites. Because roughly a third of the food humans eat depends "
    "directly or indirectly on pollinators, scientists consider the decline a serious concern for global food "
    "security, not just an environmental one."
)

add("rc_001", "VERBAL", "READING_COMPREHENSION", "detail-recall", "EASY",
    "According to the passage, how does pollen typically move from one flower to another?",
    opt("Wind carries it", "It sticks to a bee's body and rubs off at the next flower", "Birds transport it",
        "It travels through the plant's roots"),
    "It sticks to a bee's body and rubs off at the next flower",
    "The passage explains pollen sticks to a bee's body hairs and rubs off at the next flower it visits.", 60,
    ["reading-comprehension"], passage_bees)

add("rc_002", "VERBAL", "READING_COMPREHENSION", "inference", "MEDIUM",
    "Why does the passage describe honeybee decline as more than an environmental concern?",
    opt("Because bees are becoming extinct", "Because a large share of human food depends on pollinators",
        "Because pesticides are expensive", "Because beekeepers are losing income"),
    "Because a large share of human food depends on pollinators",
    "The passage ties the decline to food security because roughly a third of human food depends on pollinators.",
    90, ["reading-comprehension", "inference"], passage_bees)

add("rc_003", "VERBAL", "READING_COMPREHENSION", "detail-recall", "MEDIUM_PLUS",
    "Which of the following is NOT mentioned in the passage as a cause of colony loss?",
    opt("Pesticide exposure", "Habitat loss", "Parasitic mites", "Climate change"), "Climate change",
    "The passage lists pesticide exposure, habitat loss, and parasitic mites - climate change is not mentioned.",
    100, ["reading-comprehension"], passage_bees)

passage_press = (
    "Before the fifteenth century, books in Europe were copied out by hand, a slow process that made them "
    "expensive and rare. Johannes Gutenberg changed this when he developed a printing press that used movable "
    "metal type, allowing individual letters to be arranged, inked, and reused for different pages. His method "
    "made it possible to produce many identical copies of a text far faster than any scribe could. Within "
    "decades, printing workshops had spread across Europe, and the cost of books fell sharply. This wider "
    "access to printed material is often credited with accelerating the spread of new ideas during the "
    "Renaissance and later contributing to rising literacy rates across the continent."
)

add("rc_004", "VERBAL", "READING_COMPREHENSION", "detail-recall", "EASY",
    "What made Gutenberg's printing method different from earlier book production?",
    opt("He used cheaper paper", "He used movable metal type that could be rearranged and reused",
        "He wrote faster than scribes", "He translated books into more languages"),
    "He used movable metal type that could be rearranged and reused",
    "The passage credits Gutenberg's use of movable metal type, letters that could be arranged, inked, and reused.",
    65, ["reading-comprehension"], passage_press)

add("rc_005", "VERBAL", "READING_COMPREHENSION", "inference", "MEDIUM",
    "According to the passage, what was one long-term effect of the printing press?",
    opt("Books became rarer", "Literacy rates rose across Europe", "Handwriting improved",
        "Scribes became more in demand"),
    "Literacy rates rose across Europe",
    "The passage states wider access to printed material contributed to rising literacy rates across the continent.",
    85, ["reading-comprehension"], passage_press)

add("rc_006", "VERBAL", "READING_COMPREHENSION", "vocabulary-in-context", "MEDIUM",
    "The word 'accelerating' in the passage most nearly means:", opt("Slowing", "Speeding up", "Reversing", "Measuring"),
    "Speeding up",
    "'Accelerating' means increasing the speed or rate of something - here, the spread of new ideas.", 60,
    ["reading-comprehension", "vocabulary"], passage_press)

passage_energy = (
    "Solar and wind power are often described as intermittent sources of energy, since a solar panel produces "
    "little electricity at night and a wind turbine generates none when the air is still. This variability "
    "creates a challenge for electrical grids, which must balance supply and demand at every moment. One "
    "common solution is to pair renewable generation with large-scale battery storage, so that excess "
    "electricity produced on sunny or windy days can be saved and released later when generation drops. Grid "
    "operators also rely on a mix of energy sources and improved forecasting to anticipate changes in wind and "
    "sunlight, reducing the risk of sudden shortfalls. As storage technology becomes cheaper, some regions have "
    "begun running on renewable sources for extended stretches without interruption."
)

add("rc_007", "VERBAL", "READING_COMPREHENSION", "detail-recall", "MEDIUM",
    "Why are solar and wind power described as 'intermittent'?",
    opt("They are illegal in some countries", "Their output varies depending on conditions like sunlight and wind",
        "They cannot be stored at all", "They are more expensive than fossil fuels"),
    "Their output varies depending on conditions like sunlight and wind",
    "The passage explains solar and wind output varies with conditions such as darkness or still air.", 85,
    ["reading-comprehension"], passage_energy)

add("rc_008", "VERBAL", "READING_COMPREHENSION", "detail-recall", "MEDIUM_PLUS",
    "According to the passage, what is one way grid operators manage the variability of renewable energy?",
    opt("Shutting down the grid at night", "Relying solely on solar power", "Pairing renewables with battery storage",
        "Banning wind turbines"),
    "Pairing renewables with battery storage",
    "The passage names battery storage, alongside a mix of sources and forecasting, as ways to manage variability.",
    110, ["reading-comprehension"], passage_energy)

add("rc_009", "VERBAL", "READING_COMPREHENSION", "main-idea", "HARD",
    "Which statement best reflects the passage's overall argument?",
    opt("Renewable energy is currently too unreliable to ever replace fossil fuels",
        "The challenges of variable renewable output can be managed through storage, diverse sources, and forecasting",
        "Battery storage has made wind and solar power obsolete",
        "Grid operators prefer fossil fuels because renewables cannot be forecasted"),
    "The challenges of variable renewable output can be managed through storage, diverse sources, and forecasting",
    "The passage presents variability as a manageable challenge, describing storage, a mix of sources, and "
    "forecasting as practical mitigations - not as reasons renewables are unworkable.", 160,
    ["reading-comprehension", "main-idea"], passage_energy)

print(json.dumps({"count": len(questions), "ids": [q["id"] for q in questions]}, indent=2))
with open("handauthored_questions.json", "w") as f:
    json.dump(questions, f, indent=2)
print(f"\nWrote {len(questions)} hand-authored questions to handauthored_questions.json")
