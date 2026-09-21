import type { NoveltyLevel, ContextType } from "../src/types/index.js";

export interface SeedQuestion {
  prompt: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  difficulty: number;
  noveltyLevel: NoveltyLevel;
  contextType: ContextType;
  expectedTimeSeconds: number;
}

function q(
  prompt: string,
  choices: string[],
  correctIndex: number,
  explanation: string,
  difficulty: number,
  noveltyLevel: NoveltyLevel,
  contextType: ContextType,
  expectedTimeSeconds: number
): SeedQuestion {
  return { prompt, choices, correctIndex, explanation, difficulty, noveltyLevel, contextType, expectedTimeSeconds };
}

const PERCENTAGES: SeedQuestion[] = [
  // FAMILIAR / LABELED
  q("What is 15% of 240?", ["30", "32", "36", "40"], 2, "0.15 x 240 = 36.", 0.3, "FAMILIAR", "LABELED", 30),
  q("A number increased by 25% becomes 150. What was the original number?", ["100", "110", "120", "125"], 2, "x * 1.25 = 150, so x = 120.", 0.35, "FAMILIAR", "LABELED", 40),
  q("In a class of 40 students, 60% are girls. How many boys are there?", ["14", "16", "18", "20"], 1, "60% of 40 are girls (24), so 40 - 24 = 16 boys.", 0.3, "FAMILIAR", "LABELED", 30),
  // FAMILIAR / MIXED_CONTEXT
  q("A store had 240 items in stock. By the end of the sale, 36 items had sold. Out of every 100 items, how many sold?", ["10", "12", "15", "18"], 2, "36/240 = 0.15, i.e. 15 per 100.", 0.35, "FAMILIAR", "MIXED_CONTEXT", 40),
  q("A tank was 120 liters full. It now holds 96 liters. At this rate, how many liters were lost per 100 liters of original capacity?", ["15", "18", "20", "24"], 2, "(120-96)/120 = 0.20, i.e. 20 per 100.", 0.35, "FAMILIAR", "MIXED_CONTEXT", 40),
  // SLIGHTLY_VARIANT / LABELED
  q("A price is first increased by 10% and then decreased by 10%. What is the overall change from the original price?", ["No change", "1% decrease", "1% increase", "10% decrease"], 1, "1.10 x 0.90 = 0.99, a net 1% decrease.", 0.55, "SLIGHTLY_VARIANT", "LABELED", 60),
  q("After a 20% discount, a jacket costs $96. What was the original price?", ["$100", "$110", "$115", "$120"], 3, "96 / 0.80 = 120.", 0.5, "SLIGHTLY_VARIANT", "LABELED", 50),
  q("A company's workforce grew from 250 to 275. What was the percentage increase?", ["8%", "9%", "10%", "12%"], 2, "25/250 = 0.10 = 10%.", 0.45, "SLIGHTLY_VARIANT", "LABELED", 45),
  // SLIGHTLY_VARIANT / MIXED_CONTEXT
  q("A shop's revenue was $250 last month and is $275 this month. Compared to last month, express the change as an amount per hundred.", ["8", "9", "10", "12"], 2, "25/250 = 10 per hundred.", 0.5, "SLIGHTLY_VARIANT", "MIXED_CONTEXT", 55),
  q("A container is filled, then 10% of its contents are poured out, and then 10% of what remains is poured out again. Per hundred of the ORIGINAL amount, how much is left?", ["80", "81", "90", "99"], 1, "0.90 x 0.90 = 0.81, i.e. 81 per hundred.", 0.6, "SLIGHTLY_VARIANT", "MIXED_CONTEXT", 65),
  q("A phone's battery was at 80% at noon and 20% at 6pm. On average, how many percentage-points did it drop per hour over those 6 hours?", ["8", "9", "10", "12"], 2, "(80-20)/6 = 10 points per hour.", 0.5, "SLIGHTLY_VARIANT", "MIXED_CONTEXT", 55),
  q("A jar had 150 candies. Children took candies until only 90 were left. Out of every 100 original candies, how many were taken?", ["35", "40", "45", "50"], 1, "60/150 = 0.40, i.e. 40 per 100.", 0.5, "SLIGHTLY_VARIANT", "MIXED_CONTEXT", 50),
  // NOVEL / MIXED_CONTEXT
  q("A jacket's price is marked up from $80 to $100, then marked down until it returns to $80. By what amount per hundred was it marked down from $100?", ["18", "20", "22", "25"], 1, "(100-80)/100 = 20 per hundred - note this differs from the 25% markup, since the base changed.", 0.7, "NOVEL", "MIXED_CONTEXT", 75),
  q("A tank is 40% full. After adding 60 liters, it becomes 70% full. What is the tank's total capacity?", ["150", "180", "200", "220"], 2, "0.70C - 0.40C = 60, so 0.30C = 60, C = 200.", 0.7, "NOVEL", "MIXED_CONTEXT", 80),
  q("An investment grows by the same rate each year. After one year, $500 becomes $550. What is its value after two years from the start?", ["$590", "$600", "$605", "$610"], 2, "Rate is 10%/year. Year 2: 550 x 1.10 = 605.", 0.65, "NOVEL", "MIXED_CONTEXT", 75),
  q("A student scored 45 out of 60 on Test A and 54 out of 72 on Test B. Compared on a common base of 100, which test was the better score, and by how many points?", ["A, by 5", "B, by 5", "Equal, by 0", "B, by 10"], 2, "45/60 = 75%, 54/72 = 75% - the scores are identical once compared on the same base.", 0.75, "NOVEL", "MIXED_CONTEXT", 80),
  q("Two products both cost $200. Product X's price rises to $240. Product Y's price falls by the same dollar amount X rose by. By what rate did Product Y's price fall?", ["15%", "18%", "20%", "25%"], 2, "X rose $40. Y falls to $160, a fall of 40/200 = 20%.", 0.7, "NOVEL", "MIXED_CONTEXT", 75),
  q("A phone originally cost $300. It was discounted 25%, and a further 10% was taken off the discounted price at checkout. What was the final price?", ["$195", "$200", "$202.50", "$210"], 2, "300 x 0.75 = 225; 225 x 0.90 = 202.50. Successive discounts don't simply add.", 0.75, "NOVEL", "MIXED_CONTEXT", 80),
];

const DATA_INTERPRETATION: SeedQuestion[] = [
  // FAMILIAR / LABELED
  q("A shop's unit sales over 4 days were Mon 120, Tue 160, Wed 90, Thu 170. What is the average daily sales?", ["125", "130", "135", "140"], 2, "(120+160+90+170)/4 = 540/4 = 135.", 0.35, "FAMILIAR", "LABELED", 40),
  q("Using Mon 120, Tue 160, Wed 90, Thu 170, which day's sales were closest to the average of 135?", ["Monday", "Tuesday", "Wednesday", "Thursday"], 0, "|120-135|=15 is the smallest gap of the four days.", 0.4, "FAMILIAR", "LABELED", 45),
  q("A survey of 200 people found 80 prefer tea and 70 prefer coffee. How many prefer neither?", ["40", "45", "50", "55"], 2, "200 - 80 - 70 = 50.", 0.3, "FAMILIAR", "LABELED", 35),
  // FAMILIAR / MIXED_CONTEXT
  q("A total of 90 items are split between two shelves so that one shelf has twice as many items as the other. How many items are on the larger shelf?", ["45", "55", "60", "65"], 2, "x + 2x = 90, x = 30, larger = 60.", 0.35, "FAMILIAR", "MIXED_CONTEXT", 40),
  q("A box contains red and blue balls in the ratio 3:5. If there are 24 red balls, how many blue balls are there?", ["32", "36", "40", "45"], 2, "24/3 = 8 per part; blue = 5 x 8 = 40.", 0.35, "FAMILIAR", "MIXED_CONTEXT", 40),
  // SLIGHTLY_VARIANT / LABELED
  q("Warehouse A had 340 units, Warehouse B had 260. After transferring 40 units from A to B, what is the new ratio of A's stock to B's stock?", ["1:1", "3:2", "2:1", "5:3"], 0, "A becomes 300, B becomes 300 - a 1:1 ratio.", 0.55, "SLIGHTLY_VARIANT", "LABELED", 55),
  q("A factory produced 500 units in Week 1, rising by 60 units each subsequent week. How many units in Week 4?", ["620", "650", "680", "700"], 2, "Week 4 = 500 + 60x3 = 680.", 0.5, "SLIGHTLY_VARIANT", "LABELED", 50),
  q("In a survey of 300 people, 40% chose Option A and the rest split evenly between B and C. How many chose Option C?", ["60", "75", "90", "100"], 2, "A = 120; remaining 180 split evenly, C = 90.", 0.55, "SLIGHTLY_VARIANT", "LABELED", 55),
  // SLIGHTLY_VARIANT / MIXED_CONTEXT
  q("Over three months a business recorded expenses of $2,400, $2,700, and $2,100. Budgeting next month at the same average, how much should be set aside?", ["$2,200", "$2,300", "$2,400", "$2,500"], 2, "(2400+2700+2100)/3 = 2400.", 0.5, "SLIGHTLY_VARIANT", "MIXED_CONTEXT", 55),
  q("A van made these numbers of stops this week: 12, 15, 9, 18, 11. On how many days did it make more stops than the week's average?", ["1", "2", "3", "4"], 1, "Average = 13. Days above 13: 15 and 18, so 2 days.", 0.55, "SLIGHTLY_VARIANT", "MIXED_CONTEXT", 60),
  q("Two classes have 28 and 32 students. If 25% of each class is absent today, how many students are present in total?", ["40", "42", "45", "48"], 2, "28x0.75=21, 32x0.75=24, total 45.", 0.55, "SLIGHTLY_VARIANT", "MIXED_CONTEXT", 55),
  q("A runner's lap times in seconds were 82, 79, 85, 78. By how many seconds was the slowest lap slower than the fastest?", ["5", "6", "7", "8"], 2, "85 - 78 = 7.", 0.4, "SLIGHTLY_VARIANT", "MIXED_CONTEXT", 40),
  // NOVEL / MIXED_CONTEXT
  q("Weekend ticket sales, all at $15/ticket: Friday $1,800, Saturday $2,400, Sunday $1,500. On which day were the fewest tickets sold, and how many?", ["Friday, 120", "Saturday, 160", "Sunday, 100", "Sunday, 120"], 2, "Fri=120, Sat=160, Sun=100 tickets - Sunday had the fewest.", 0.65, "NOVEL", "MIXED_CONTEXT", 70),
  q("A company's costs were $12,000 fixed plus $8 per unit. Total cost for a month was $28,000. How many units were produced?", ["1,800", "1,900", "2,000", "2,200"], 2, "(28000-12000)/8 = 2000.", 0.6, "NOVEL", "MIXED_CONTEXT", 65),
  q("In a class, the ratio of students who passed to failed is 5:2. If 14 students failed, how many passed?", ["30", "32", "35", "38"], 2, "14/2 = 7 per part; passed = 5x7 = 35.", 0.55, "NOVEL", "MIXED_CONTEXT", 60),
  q("A car travels the first half of a 300 km trip at 60 km/h and the second half at 100 km/h. What is the average speed for the whole trip?", ["70", "75", "78", "80"], 1, "Time = 150/60 + 150/100 = 4h. Average speed = 300/4 = 75 km/h (not the simple average of the two speeds).", 0.8, "NOVEL", "MIXED_CONTEXT", 90),
  q("A staff of 15 each worked 8 hours/day for 5 days, but 3 of them were out sick for 2 of those days. How many total staff-hours were worked?", ["540", "548", "552", "560"], 2, "Base 15x8x5=600; lost = 3x2x8=48; 600-48=552.", 0.7, "NOVEL", "MIXED_CONTEXT", 80),
  q("A savings account had $2,000 and earned 5% simple interest per year for 3 years. How much interest was earned in total?", ["$250", "$300", "$320", "$350"], 1, "2000 x 0.05 x 3 = 300.", 0.55, "NOVEL", "MIXED_CONTEXT", 60),
];

const RATIO_PROPORTION: SeedQuestion[] = [
  q("Divide $600 between A and B in the ratio 2:3. How much does B receive?", ["$240", "$300", "$340", "$360"], 3, "5 parts total, $120/part; B gets 3 x 120 = 360.", 0.35, "FAMILIAR", "LABELED", 40),
  q("If 8 workers can complete a task in 15 days, how many workers are needed to finish it in 6 days?", ["15", "18", "20", "24"], 2, "8x15=120 worker-days; 120/6=20 workers.", 0.45, "FAMILIAR", "LABELED", 45),
  q("A recipe requires flour and sugar in the ratio 5:2. If 10 cups of flour are used, how much sugar is needed?", ["3", "4", "5", "6"], 1, "10/5=2 per part; sugar=2x2=4 cups.", 0.35, "FAMILIAR", "LABELED", 35),
  q("The ratio of boys to girls in a school is 4:5. If there are 180 students total, how many girls are there?", ["80", "90", "100", "110"], 2, "9 parts total, 20/part; girls = 5x20=100.", 0.4, "FAMILIAR", "LABELED", 40),
];

const TIME_WORK: SeedQuestion[] = [
  q("A can finish a job in 10 days, B in 15 days. Working together, how many days will they take?", ["5", "6", "7", "8"], 1, "Combined rate = 1/10+1/15 = 1/6, so 6 days.", 0.5, "FAMILIAR", "LABELED", 50),
  q("A worker completes 1/4 of a task in 3 days. At the same rate, how many total days for the whole task?", ["10", "11", "12", "14"], 2, "3 x 4 = 12 days.", 0.35, "FAMILIAR", "LABELED", 35),
  q("Pipe A fills a tank in 12 hours, Pipe B empties it in 20 hours. With both open, how long to fill the tank?", ["24", "28", "30", "36"], 2, "Net rate = 1/12-1/20 = 1/30, so 30 hours.", 0.6, "FAMILIAR", "LABELED", 55),
  q("12 workers build a wall in 18 days. How many days would 18 workers take at the same rate each?", ["10", "12", "14", "15"], 1, "12x18=216 worker-days; 216/18=12 days.", 0.45, "FAMILIAR", "LABELED", 45),
];

const LOGICAL_REASONING: SeedQuestion[] = [
  q("All cats are mammals. All mammals are animals. Therefore:", ["All cats are animals", "All animals are cats", "Some animals are not cats", "No cats are animals"], 0, "A valid chain syllogism: cats -> mammals -> animals.", 0.3, "FAMILIAR", "LABELED", 30),
  q("No fish are birds. All sparrows are birds. Therefore:", ["No sparrows are fish", "All sparrows are fish", "Some fish are sparrows", "No birds are fish"], 0, "Sparrows are all birds, and no birds are fish, so no sparrows are fish.", 0.35, "FAMILIAR", "LABELED", 35),
  q("Some doctors are teachers. All teachers are graduates. Which conclusion definitely follows?", ["Some doctors are graduates", "All doctors are graduates", "No doctors are graduates", "All graduates are doctors"], 0, "The doctors who are teachers are also graduates, so 'some doctors are graduates' follows.", 0.4, "FAMILIAR", "LABELED", 40),
  q("All squares are rectangles. All rectangles are quadrilaterals. Therefore:", ["All squares are quadrilaterals", "All quadrilaterals are squares", "No squares are quadrilaterals", "Some rectangles are not quadrilaterals"], 0, "A valid chain syllogism: squares -> rectangles -> quadrilaterals.", 0.3, "FAMILIAR", "LABELED", 30),
];

const VERBAL_RC: SeedQuestion[] = [
  q(
    "The library extended its hours during exam season, staying open until midnight instead of the usual 8pm closing time, after student surveys showed high demand for late study space. Why did the library extend its hours?",
    ["To save on electricity", "Because students requested more late study time", "Because the librarian preferred later hours", "To compete with a nearby cafe"],
    1,
    "The passage directly states the extension followed surveys showing high demand for late study space.",
    0.35,
    "FAMILIAR",
    "LABELED",
    45
  ),
  q(
    "Although the new policy was intended to reduce paperwork, several departments reported an increase in administrative tasks during its first month. What does this suggest about the policy's early results?",
    ["It worked exactly as intended", "It had the opposite of its intended effect, at least initially", "It was cancelled immediately", "No departments were affected"],
    1,
    "The passage contrasts the policy's intent (less paperwork) with its actual early effect (more tasks).",
    0.4,
    "FAMILIAR",
    "LABELED",
    45
  ),
  q(
    "Despite a forecast of heavy rain, the outdoor concert proceeded as scheduled, and organizers reported attendance only slightly lower than expected. What can be inferred?",
    ["The concert was cancelled", "Attendance was much lower than expected", "The concert still had a similar turnout to what was expected", "It did not rain at all"],
    2,
    "'Only slightly lower than expected' implies turnout was still close to expectations.",
    0.4,
    "FAMILIAR",
    "LABELED",
    45
  ),
  q(
    "The company's quarterly report showed revenue growth, but profit margins narrowed due to rising material costs. What happened to the company's profit margins?",
    ["They widened", "They narrowed", "They stayed exactly the same", "They were not mentioned"],
    1,
    "The passage states margins narrowed, directly answering the question.",
    0.3,
    "FAMILIAR",
    "LABELED",
    35
  ),
];

export const SKILLS: Array<{ key: string; name: string; category: string; importance: number; questions: SeedQuestion[] }> = [
  { key: "percentages", name: "Percentages", category: "Quantitative", importance: 1.2, questions: PERCENTAGES },
  { key: "data-interpretation", name: "Data Interpretation", category: "Quantitative", importance: 1.3, questions: DATA_INTERPRETATION },
  { key: "ratio-proportion", name: "Ratio & Proportion", category: "Quantitative", importance: 1.0, questions: RATIO_PROPORTION },
  { key: "time-work", name: "Time & Work", category: "Quantitative", importance: 1.0, questions: TIME_WORK },
  { key: "syllogisms", name: "Logical Reasoning - Syllogisms", category: "Logical Reasoning", importance: 0.9, questions: LOGICAL_REASONING },
  { key: "reading-comprehension", name: "Reading Comprehension", category: "Verbal", importance: 0.9, questions: VERBAL_RC },
];
