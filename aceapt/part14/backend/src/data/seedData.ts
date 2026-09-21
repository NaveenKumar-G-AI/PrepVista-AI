/**
 * Skill graph + question bank.
 *
 * No existing ACEAPT repository was provided to inspect (see README.md), so
 * this is a from-scratch but representative slice of a Quantitative
 * Aptitude domain, built specifically to exercise every dimension the
 * mastery engine reasons about: a healthy prerequisite chain (bottleneck
 * detection), a weak prerequisite chain (root-cause detection), a
 * composite skill (composition-gap hook), and a skill with rich
 * familiar/novel/difficulty spread for the core transfer-ladder demo.
 */

import { Question, Skill } from '../domain/types';

export const SKILLS: Skill[] = [
  { id: 'percentage', domain: 'Quantitative Aptitude', topic: 'Percentage', name: 'Percentages', prerequisiteIds: [] },
  { id: 'profit_loss', domain: 'Quantitative Aptitude', topic: 'Percentage', name: 'Profit & Loss', prerequisiteIds: ['percentage'] },
  { id: 'discount', domain: 'Quantitative Aptitude', topic: 'Percentage', name: 'Discount', prerequisiteIds: ['profit_loss'] },
  { id: 'ratios', domain: 'Quantitative Aptitude', topic: 'Ratio', name: 'Ratios', prerequisiteIds: [] },
  { id: 'ratio_proportion', domain: 'Quantitative Aptitude', topic: 'Ratio', name: 'Ratio & Proportion', prerequisiteIds: ['ratios'] },
  { id: 'probability', domain: 'Quantitative Aptitude', topic: 'Probability', name: 'Probability', prerequisiteIds: [] },
  { id: 'permutations', domain: 'Quantitative Aptitude', topic: 'Counting', name: 'Permutations & Combinations', prerequisiteIds: [] },
  {
    id: 'data_interpretation',
    domain: 'Quantitative Aptitude',
    topic: 'Data Interpretation',
    name: 'Data Interpretation',
    prerequisiteIds: ['percentage', 'ratios'],
    compositeOf: ['percentage', 'ratios'],
  },
];

export const QUESTIONS: Question[] = [
  // ---------------------------------------------------------------- percentage
  { id: 'p1', skillId: 'percentage', prompt: 'What is 25% of 160?', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'basic', choices: ['40', '35', '45', '50'], correctAnswer: '40' },
  { id: 'p2', skillId: 'percentage', prompt: 'Express 3/5 as a percentage.', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'basic', choices: ['60%', '50%', '65%', '55%'], correctAnswer: '60%' },
  { id: 'p3', skillId: 'percentage', prompt: "A shop's sales were ₹4,000, of which 30% was profit. Find the profit.", difficulty: 'easy', format: 'table', novelty: 'similar', context: 'basic', choices: ['₹1,200', '₹1,000', '₹1,500', '₹800'], correctAnswer: '₹1,200' },
  { id: 'p4', skillId: 'percentage', prompt: 'A jacket costs ₹2,000. After a 12% discount, what is the sale price?', difficulty: 'medium', format: 'word_problem', novelty: 'similar', context: 'discount', choices: ['₹1,760', '₹1,800', '₹1,880', '₹1,700'], correctAnswer: '₹1,760' },
  { id: 'p5', skillId: 'percentage', prompt: "A startup's monthly users grew from 8,000 to 9,600. What was the percentage increase?", difficulty: 'medium', format: 'scenario', novelty: 'varied', context: 'business', choices: ['20%', '18%', '16%', '25%'], correctAnswer: '20%' },
  { id: 'p6', skillId: 'percentage', prompt: "A town's population fell from 50,000 to 46,500. What is the percentage decrease?", difficulty: 'medium', format: 'applied', novelty: 'varied', context: 'population', choices: ['7%', '6%', '8%', '9%'], correctAnswer: '7%' },
  { id: 'p7', skillId: 'percentage', prompt: 'A sum increases by 10% in year one and decreases by 10% in year two. What is the net percentage change?', difficulty: 'hard', format: 'multi_step', novelty: 'novel', context: 'finance', choices: ['-1%', '0%', '-2%', '+1%'], correctAnswer: '-1%' },
  { id: 'p8', skillId: 'percentage', prompt: "Village A's population is 20% more than village B's (25,000). A's population then falls by 10%. Find A's new population as a percentage of B's original population.", difficulty: 'hard', format: 'data_interpretation', novelty: 'novel', context: 'population', choices: ['108%', '110%', '120%', '90%'], correctAnswer: '108%' },
  { id: 'p9', skillId: 'percentage', prompt: 'A price is marked up by 25%, then discounted by 20%. What is the net percentage change from the original price?', difficulty: 'hard', format: 'scenario', novelty: 'novel', context: 'finance', choices: ['0%', '+5%', '-5%', '+2%'], correctAnswer: '0%' },
  { id: 'p10', skillId: 'percentage', prompt: '40% of a number is 88. What is the number?', difficulty: 'medium', format: 'word_problem', novelty: 'similar', context: 'basic', choices: ['220', '200', '210', '230'], correctAnswer: '220' },

  // -------------------------------------------------------------- profit_loss
  { id: 'pl1', skillId: 'profit_loss', prompt: 'A shopkeeper buys an item for ₹500 and sells it for ₹600. Find the profit percentage.', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'basic', choices: ['20%', '15%', '25%', '10%'], correctAnswer: '20%' },
  { id: 'pl2', skillId: 'profit_loss', prompt: 'Cost price ₹800, sold at a loss of ₹80. Find the loss percentage.', difficulty: 'easy', format: 'word_problem', novelty: 'seen', context: 'basic', choices: ['10%', '8%', '12%', '15%'], correctAnswer: '10%' },
  { id: 'pl3', skillId: 'profit_loss', prompt: 'A trader marks goods 40% above cost, then gives a 10% discount. Find the profit percentage.', difficulty: 'medium', format: 'scenario', novelty: 'similar', context: 'retail', choices: ['26%', '30%', '24%', '20%'], correctAnswer: '26%' },
  { id: 'pl4', skillId: 'profit_loss', prompt: 'By selling an article for ₹1,200, a shopkeeper gains 20%. Find the cost price.', difficulty: 'medium', format: 'word_problem', novelty: 'varied', context: 'retail', choices: ['₹1,000', '₹960', '₹1,050', '₹1,100'], correctAnswer: '₹1,000' },
  { id: 'pl5', skillId: 'profit_loss', prompt: 'A wholesaler sells to a retailer at 15% profit, who resells at 20% profit on his cost. The customer paid ₹1,380. Find the wholesaler\'s original cost.', difficulty: 'hard', format: 'multi_step', novelty: 'novel', context: 'wholesale', choices: ['₹1,000', '₹1,050', '₹1,100', '₹950'], correctAnswer: '₹1,000' },
  { id: 'pl6', skillId: 'profit_loss', prompt: 'Two items are sold at ₹1,200 each — one at 20% profit, one at 20% loss. Find the overall result.', difficulty: 'hard', format: 'scenario', novelty: 'novel', context: 'retail', choices: ['Loss of ₹100', 'No profit no loss', 'Profit of ₹100', 'Loss of ₹50'], correctAnswer: 'Loss of ₹100' },
  { id: 'pl7', skillId: 'profit_loss', prompt: 'An article bought for ₹450 is sold at a 12% profit. Find the selling price.', difficulty: 'medium', format: 'word_problem', novelty: 'similar', context: 'basic', choices: ['₹504', '₹500', '₹510', '₹495'], correctAnswer: '₹504' },
  { id: 'pl8', skillId: 'profit_loss', prompt: 'The table lists cost/selling price pairs for four items. Which row shows a loss?', difficulty: 'easy', format: 'table', novelty: 'similar', context: 'basic', choices: ['Row B', 'Row A', 'Row C', 'Row D'], correctAnswer: 'Row B' },

  // ---------------------------------------------------------------- discount
  { id: 'd1', skillId: 'discount', prompt: 'A ₹500 item is discounted by 10%. Find the sale price.', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'retail', choices: ['₹450', '₹460', '₹440', '₹470'], correctAnswer: '₹450' },
  { id: 'd2', skillId: 'discount', prompt: 'Find a single discount equivalent to two successive discounts of 10% and 10%.', difficulty: 'easy', format: 'word_problem', novelty: 'seen', context: 'retail', choices: ['19%', '20%', '18%', '21%'], correctAnswer: '19%' },
  { id: 'd3', skillId: 'discount', prompt: "A store offers 'buy one, get one at 50% off'. Two ₹400 shirts are bought. What is the effective discount on the total bill?", difficulty: 'medium', format: 'scenario', novelty: 'similar', context: 'retail', choices: ['25%', '20%', '30%', '15%'], correctAnswer: '25%' },
  { id: 'd4', skillId: 'discount', prompt: 'During a sale, a ₹2,500 item is discounted 15%, then an extra 5% off for members. Find the final price.', difficulty: 'medium', format: 'applied', novelty: 'varied', context: 'festival_sale', choices: ['₹2,018.75', '₹2,000', '₹2,050', '₹1,995'], correctAnswer: '₹2,018.75' },
  { id: 'd5', skillId: 'discount', prompt: "A shop advertises 'flat 30% off, extra 10% off on billing'. What single discount does this represent?", difficulty: 'hard', format: 'multi_step', novelty: 'novel', context: 'festival_sale', choices: ['37%', '40%', '36%', '33%'], correctAnswer: '37%' },
  { id: 'd6', skillId: 'discount', prompt: "An item's marked price is 60% above cost. After a discount, it sells at a 12% profit. Find the discount percentage.", difficulty: 'hard', format: 'scenario', novelty: 'novel', context: 'retail', choices: ['30%', '28%', '32%', '25%'], correctAnswer: '30%' },

  // ----------------------------------------------------------------- ratios
  { id: 'r1', skillId: 'ratios', prompt: 'Simplify the ratio 45:60.', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'basic', choices: ['3:4', '4:5', '2:3', '5:6'], correctAnswer: '3:4' },
  { id: 'r2', skillId: 'ratios', prompt: 'If a:b = 2:3, find a when b = 18.', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'basic', choices: ['12', '10', '14', '9'], correctAnswer: '12' },
  { id: 'r3', skillId: 'ratios', prompt: '₹600 is divided between A and B in the ratio 2:3. Find A\'s share.', difficulty: 'medium', format: 'word_problem', novelty: 'similar', context: 'sharing', choices: ['₹240', '₹250', '₹200', '₹300'], correctAnswer: '₹240' },
  { id: 'r4', skillId: 'ratios', prompt: 'Two solutions are mixed in the ratio 3:2. If the mixture is 25 litres, how much of the first solution is used?', difficulty: 'medium', format: 'scenario', novelty: 'varied', context: 'mixing', choices: ['15 L', '10 L', '12 L', '18 L'], correctAnswer: '15 L' },
  { id: 'r5', skillId: 'ratios', prompt: 'A:B:C = 2:3:5. If C gets ₹150 more than A, find B\'s share.', difficulty: 'hard', format: 'multi_step', novelty: 'novel', context: 'sharing', choices: ['₹150', '₹120', '₹180', '₹100'], correctAnswer: '₹150' },
  { id: 'r6', skillId: 'ratios', prompt: 'The ratio of profits of two partners is 5:7. If the total profit is ₹3,600, find the difference between their shares.', difficulty: 'hard', format: 'scenario', novelty: 'novel', context: 'business', choices: ['₹600', '₹500', '₹700', '₹450'], correctAnswer: '₹600' },

  // ------------------------------------------------------- ratio_proportion
  { id: 'rp1', skillId: 'ratio_proportion', prompt: 'Find the fourth proportional to 2, 4, 6.', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'basic', choices: ['12', '10', '8', '14'], correctAnswer: '12' },
  { id: 'rp2', skillId: 'ratio_proportion', prompt: 'If x:y = 3:4 and y:z = 4:5, find x:z.', difficulty: 'medium', format: 'word_problem', novelty: 'similar', context: 'mixing', choices: ['3:5', '4:5', '3:4', '2:5'], correctAnswer: '3:5' },
  { id: 'rp3', skillId: 'ratio_proportion', prompt: 'A and B do a job in times with ratio 3:5. If B takes 20 days, how long does A take?', difficulty: 'medium', format: 'scenario', novelty: 'varied', context: 'work_rate', choices: ['12 days', '15 days', '10 days', '18 days'], correctAnswer: '12 days' },
  { id: 'rp4', skillId: 'ratio_proportion', prompt: 'Two numbers are in ratio 4:5. If 6 is subtracted from each, the new ratio is 3:4. Find the numbers.', difficulty: 'hard', format: 'multi_step', novelty: 'novel', context: 'business', choices: ['24 and 30', '20 and 25', '28 and 35', '18 and 22'], correctAnswer: '24 and 30' },
  { id: 'rp5', skillId: 'ratio_proportion', prompt: 'In what ratio must a 20%-sugar solution be mixed with a 40%-sugar solution to get a 25%-sugar solution?', difficulty: 'hard', format: 'scenario', novelty: 'novel', context: 'mixing', choices: ['3:1', '1:3', '2:1', '1:2'], correctAnswer: '3:1' },

  // -------------------------------------------------------------- probability
  { id: 'pr1', skillId: 'probability', prompt: 'A coin is tossed once. Find the probability of getting heads.', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'coins', choices: ['1/2', '1/3', '1/4', '2/3'], correctAnswer: '1/2' },
  { id: 'pr2', skillId: 'probability', prompt: 'A die is rolled once. Find the probability of getting a 4.', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'dice', choices: ['1/6', '1/3', '1/2', '1/4'], correctAnswer: '1/6' },
  { id: 'pr3', skillId: 'probability', prompt: 'A card is drawn from a standard deck. Find the probability it is a king.', difficulty: 'easy', format: 'word_problem', novelty: 'similar', context: 'cards', choices: ['1/13', '1/12', '1/26', '1/4'], correctAnswer: '1/13' },
  { id: 'pr4', skillId: 'probability', prompt: 'Two dice are rolled. Find the probability that the sum is 7.', difficulty: 'medium', format: 'word_problem', novelty: 'similar', context: 'dice', choices: ['1/6', '1/9', '1/12', '1/8'], correctAnswer: '1/6' },
  { id: 'pr5', skillId: 'probability', prompt: 'A bag has 4 red and 6 blue balls. One is drawn at random. Find the probability it is red.', difficulty: 'medium', format: 'scenario', novelty: 'varied', context: 'bags', choices: ['2/5', '1/2', '3/5', '1/3'], correctAnswer: '2/5' },
  { id: 'pr6', skillId: 'probability', prompt: 'In a class of 30, 18 study Physics. A student is picked at random. Find the probability they do NOT study Physics.', difficulty: 'medium', format: 'applied', novelty: 'varied', context: 'real_world', choices: ['2/5', '3/5', '1/2', '1/3'], correctAnswer: '2/5' },
  { id: 'pr7', skillId: 'probability', prompt: 'Two cards are drawn without replacement from a standard deck. Find the probability both are aces.', difficulty: 'hard', format: 'multi_step', novelty: 'novel', context: 'cards', choices: ['1/221', '1/169', '1/13', '4/221'], correctAnswer: '1/221' },
  { id: 'pr8', skillId: 'probability', prompt: 'A bag has 5 red and 3 green balls. Two are drawn without replacement. Find the probability both are green.', difficulty: 'hard', format: 'scenario', novelty: 'novel', context: 'bags', choices: ['3/28', '1/8', '3/8', '1/4'], correctAnswer: '3/28' },
  { id: 'pr9', skillId: 'probability', prompt: 'A survey shows 60% like tea, 50% like coffee, 30% like both. Find the probability a random person likes neither.', difficulty: 'hard', format: 'data_interpretation', novelty: 'novel', context: 'real_world', choices: ['1/5', '3/10', '2/5', '1/4'], correctAnswer: '1/5' },
  { id: 'pr10', skillId: 'probability', prompt: 'A die is rolled twice. Find the probability of getting an even number both times.', difficulty: 'medium', format: 'word_problem', novelty: 'similar', context: 'dice', choices: ['1/4', '1/3', '1/2', '1/6'], correctAnswer: '1/4' },
  { id: 'pr11', skillId: 'probability', prompt: 'Machine A makes 60% of items with a 2% defect rate; Machine B makes 40% with a 5% defect rate. Find the probability a random item is defective.', difficulty: 'hard', format: 'scenario', novelty: 'varied', context: 'real_world', choices: ['0.032', '0.035', '0.028', '0.04'], correctAnswer: '0.032' },

  // ------------------------------------------------------------ permutations
  { id: 'pm1', skillId: 'permutations', prompt: 'In how many ways can 4 books be arranged on a shelf?', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'basic', choices: ['24', '12', '16', '20'], correctAnswer: '24' },
  { id: 'pm2', skillId: 'permutations', prompt: 'Find the value of ⁵P₂.', difficulty: 'easy', format: 'direct', novelty: 'seen', context: 'basic', choices: ['20', '10', '15', '25'], correctAnswer: '20' },
  { id: 'pm3', skillId: 'permutations', prompt: 'In how many ways can 3 of 5 people be seated in a row of 3 chairs?', difficulty: 'medium', format: 'word_problem', novelty: 'similar', context: 'seating', choices: ['60', '50', '40', '30'], correctAnswer: '60' },
  { id: 'pm4', skillId: 'permutations', prompt: 'In how many ways can a committee of 3 be chosen from 6 people?', difficulty: 'medium', format: 'scenario', novelty: 'varied', context: 'committees', choices: ['20', '15', '18', '24'], correctAnswer: '20' },
  { id: 'pm5', skillId: 'permutations', prompt: "How many distinct 3-letter arrangements can be made from the letters of the word 'CAT'?", difficulty: 'medium', format: 'word_problem', novelty: 'similar', context: 'seating', choices: ['6', '3', '9', '12'], correctAnswer: '6' },
  { id: 'pm6', skillId: 'permutations', prompt: 'In how many ways can 2 boys and 2 girls be selected from 4 boys and 3 girls to form a group?', difficulty: 'hard', format: 'scenario', novelty: 'novel', context: 'committees', choices: ['18', '21', '15', '24'], correctAnswer: '18' },

  // ------------------------------------------------------- data_interpretation
  { id: 'di1', skillId: 'data_interpretation', prompt: 'The table shows quarterly sales. Q1 sales were ₹2,00,000 and Q2 grew by 15%. Find Q2 sales.', difficulty: 'medium', format: 'data_interpretation', novelty: 'seen', context: 'sales', choices: ['₹2,30,000', '₹2,20,000', '₹2,15,000', '₹2,25,000'], correctAnswer: '₹2,30,000' },
  { id: 'di2', skillId: 'data_interpretation', prompt: 'Using the same sales table, the ratio of Q3 to Q4 sales is 4:5 and Q4 is ₹2,50,000. Find Q3 sales.', difficulty: 'hard', format: 'data_interpretation', novelty: 'novel', context: 'sales', choices: ['₹2,00,000', '₹1,80,000', '₹2,20,000', '₹1,90,000'], correctAnswer: '₹2,00,000' },
  { id: 'di3', skillId: 'data_interpretation', prompt: 'A chart shows a population of 40,000 split by age group in the ratio 3:5:4 (under 18 : 18-60 : over 60). Find the percentage under 18.', difficulty: 'hard', format: 'data_interpretation', novelty: 'novel', context: 'population', choices: ['25%', '30%', '20%', '35%'], correctAnswer: '25%' },
];
