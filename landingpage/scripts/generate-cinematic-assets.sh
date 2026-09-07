#!/usr/bin/env bash
set -euo pipefail

OUTPUT_DIR="${1:-public/films}"
SANS_FONT="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
MONO_FONT="/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

mkdir -p "$OUTPUT_DIR"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=0x05070d:s=1280x720:r=30:d=10" \
  -vf "drawgrid=w=80:h=80:t=1:c=0x2f5bff@0.11,
drawbox=x=0:y=0:w=1280:h=720:c=0x05070d@0.10:t=fill,
drawtext=fontfile=${MONO_FONT}:text='PREPVISTA / CAREER ROUTE':x=64:y=46:fontsize=18:fontcolor=0x8ea5ff,
drawtext=fontfile=${SANS_FONT}:text='SOFTWARE ENGINEER':x=64:y=82:fontsize=42:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='ONE ROUTE. FIVE DIFFERENT TESTS OF YOU.':x=64:y=142:fontsize=16:fontcolor=0x9ca7bc,
drawbox=x=92:y=348:w=1096:h=4:c=0x26314a:t=fill,
drawbox=x='92+min(t/9.2\,1)*1096':y=342:w=16:h=16:c=0x7ea1ff:t=fill,
drawbox=x=92:y=344:w='min(t/9.2\,1)*1096':h=12:c=0x315bff@0.45:t=fill,
drawbox=x=92:y=270:w=190:h=176:c=0x101521:t=fill,
drawbox=x=98:y=276:w=178:h=164:c=0x315bff@0.08:t=fill,
drawtext=fontfile=${MONO_FONT}:text='01 / APTITUDE':x=116:y=294:fontsize=15:fontcolor=0x7e97ff,
drawtext=fontfile=${SANS_FONT}:text='DECIDE':x=116:y=332:fontsize=29:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='34 SEC':x=116:y=382:fontsize=15:fontcolor=0xf4a340,
drawtext=fontfile=${MONO_FONT}:text='ANSWER CHANGED':x=116:y=407:fontsize=12:fontcolor=0xffbf69,
drawbox=x=320:y=270:w=190:h=176:c=0x101521:t=fill,
drawtext=fontfile=${MONO_FONT}:text='02 / CODING':x=344:y=294:fontsize=15:fontcolor=0x7e97ff,
drawtext=fontfile=${SANS_FONT}:text='BUILD':x=344:y=332:fontsize=29:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='11 / 15 TESTS':x=344:y=382:fontsize=15:fontcolor=0x71d4f5,
drawtext=fontfile=${MONO_FONT}:text='SCALE RISK FOUND':x=344:y=407:fontsize=12:fontcolor=0x8de7ff,
drawbox=x=548:y=270:w=190:h=176:c=0x101521:t=fill,
drawtext=fontfile=${MONO_FONT}:text='03 / DEFENCE':x=572:y=294:fontsize=15:fontcolor=0x7e97ff,
drawtext=fontfile=${SANS_FONT}:text='EXPLAIN':x=572:y=332:fontsize=29:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='WHY - CLEAR':x=572:y=382:fontsize=15:fontcolor=0x2fd19a,
drawtext=fontfile=${MONO_FONT}:text='TRADE-OFF - OPEN':x=572:y=407:fontsize=12:fontcolor=0xff6b6b,
drawbox=x=776:y=270:w=190:h=176:c=0x101521:t=fill,
drawtext=fontfile=${MONO_FONT}:text='04 / INTERVIEW':x=800:y=294:fontsize=15:fontcolor=0x7e97ff,
drawtext=fontfile=${SANS_FONT}:text='DEFEND':x=800:y=332:fontsize=29:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='DEPTH 02 / 05':x=800:y=382:fontsize=15:fontcolor=0xff6b6b,
drawtext=fontfile=${MONO_FONT}:text='EVIDENCE UNPROVEN':x=800:y=407:fontsize=12:fontcolor=0xff8e8e,
drawbox=x=1004:y=270:w=184:h=176:c=0x101521:t=fill,
drawtext=fontfile=${MONO_FONT}:text='05 / DECISION':x=1028:y=294:fontsize=15:fontcolor=0x7e97ff,
drawtext=fontfile=${SANS_FONT}:text='OFFER':x=1028:y=332:fontsize=29:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='ROUTE PENDING':x=1028:y=382:fontsize=15:fontcolor=0x6c7588,
drawtext=fontfile=${MONO_FONT}:text='NOT A PROMISE':x=1028:y=407:fontsize=12:fontcolor=0x6c7588,
drawbox=x=737:y=242:w=7:h=232:c=0xff5c5c@0.92:t=fill:enable='between(t,4.7,7.0)',
drawtext=fontfile=${MONO_FONT}:text='ROUTE BLOCKED':x=780:y=492:fontsize=16:fontcolor=0xff6b6b:enable='between(t,4.7,7.0)',
drawtext=fontfile=${SANS_FONT}:text='Trade-off defence is still unproven.':x=780:y=526:fontsize=22:fontcolor=white:enable='between(t,4.7,7.0)',
drawbox=x=548:y=508:w=420:h=118:c=0x143026@0.96:t=fill:enable='gte(t,7.0)',
drawbox=x=548:y=508:w=8:h=118:c=0x2fd19a:t=fill:enable='gte(t,7.0)',
drawtext=fontfile=${MONO_FONT}:text='NEXT MISSION / 12 MIN':x=584:y=532:fontsize=15:fontcolor=0x62e6b7:enable='gte(t,7.0)',
drawtext=fontfile=${SANS_FONT}:text='Why - alternative - failure - evidence':x=584:y=568:fontsize=24:fontcolor=white:enable='gte(t,7.0)',
drawtext=fontfile=${MONO_FONT}:text='RE-TEST BEFORE INTERVIEW DAY':x=584:y=602:fontsize=13:fontcolor=0x9bdcc5:enable='gte(t,7.0)',
drawtext=fontfile=${MONO_FONT}:text='ILLUSTRATIVE PRODUCT FILM - NO HIRING PREDICTION':x=64:y=670:fontsize=13:fontcolor=0x687386" \
  -an -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart "$OUTPUT_DIR/career-route.mp4"

generate_role_route() {
  local OUTPUT_NAME="$1"
  local ROLE_TITLE="$2"
  local GATE_ONE="$3"
  local VERB_ONE="$4"
  local SIGNAL_ONE="$5"
  local GATE_TWO="$6"
  local VERB_TWO="$7"
  local SIGNAL_TWO="$8"
  local GATE_THREE="$9"
  local VERB_THREE="${10}"
  local SIGNAL_THREE="${11}"
  local GATE_FOUR="${12}"
  local VERB_FOUR="${13}"
  local SIGNAL_FOUR="${14}"
  local GATE_FIVE="${15}"
  local VERB_FIVE="${16}"
  local SIGNAL_FIVE="${17}"
  local BLOCKER="${18}"
  local MISSION="${19}"

  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "color=c=0x05070d:s=1280x720:r=30:d=10" \
    -vf "drawgrid=w=80:h=80:t=1:c=0x2f5bff@0.11,
drawtext=fontfile=${MONO_FONT}:text='PREPVISTA / ROLE-SPECIFIC ROUTE':x=64:y=46:fontsize=18:fontcolor=0x8ea5ff,
drawtext=fontfile=${SANS_FONT}:text='${ROLE_TITLE}':x=64:y=82:fontsize=38:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='THE EVIDENCE CHANGES AT EVERY GATE.':x=64:y=140:fontsize=16:fontcolor=0x9ca7bc,
drawbox=x=92:y=348:w=1096:h=4:c=0x26314a:t=fill,
drawbox=x=92:y=344:w='min(t/9.2\,1)*1096':h=12:c=0x315bff@0.45:t=fill,
drawbox=x='92+min(t/9.2\,1)*1096':y=342:w=16:h=16:c=0x7ea1ff:t=fill,
drawbox=x=92:y=270:w=190:h=176:c=0x101521:t=fill,
drawtext=fontfile=${MONO_FONT}:text='01 / ${GATE_ONE}':x=112:y=294:fontsize=14:fontcolor=0x7e97ff,
drawtext=fontfile=${SANS_FONT}:text='${VERB_ONE}':x=112:y=332:fontsize=25:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='${SIGNAL_ONE}':x=112:y=392:fontsize=11:fontcolor=0xf4a340,
drawbox=x=320:y=270:w=190:h=176:c=0x101521:t=fill,
drawtext=fontfile=${MONO_FONT}:text='02 / ${GATE_TWO}':x=340:y=294:fontsize=14:fontcolor=0x7e97ff,
drawtext=fontfile=${SANS_FONT}:text='${VERB_TWO}':x=340:y=332:fontsize=25:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='${SIGNAL_TWO}':x=340:y=392:fontsize=11:fontcolor=0x71d4f5,
drawbox=x=548:y=270:w=190:h=176:c=0x101521:t=fill,
drawtext=fontfile=${MONO_FONT}:text='03 / ${GATE_THREE}':x=568:y=294:fontsize=14:fontcolor=0x7e97ff,
drawtext=fontfile=${SANS_FONT}:text='${VERB_THREE}':x=568:y=332:fontsize=25:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='${SIGNAL_THREE}':x=568:y=392:fontsize=11:fontcolor=0x2fd19a,
drawbox=x=776:y=270:w=190:h=176:c=0x101521:t=fill,
drawtext=fontfile=${MONO_FONT}:text='04 / ${GATE_FOUR}':x=796:y=294:fontsize=14:fontcolor=0x7e97ff,
drawtext=fontfile=${SANS_FONT}:text='${VERB_FOUR}':x=796:y=332:fontsize=25:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='${SIGNAL_FOUR}':x=796:y=392:fontsize=11:fontcolor=0xff6b6b,
drawbox=x=1004:y=270:w=184:h=176:c=0x101521:t=fill,
drawtext=fontfile=${MONO_FONT}:text='05 / ${GATE_FIVE}':x=1024:y=294:fontsize=14:fontcolor=0x7e97ff,
drawtext=fontfile=${SANS_FONT}:text='${VERB_FIVE}':x=1024:y=332:fontsize=25:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='${SIGNAL_FIVE}':x=1024:y=392:fontsize=11:fontcolor=0x7a8494,
drawbox=x=737:y=242:w=7:h=232:c=0xff5c5c@0.92:t=fill:enable='between(t,4.7,7.0)',
drawtext=fontfile=${MONO_FONT}:text='CURRENT WEAK LINK':x=780:y=492:fontsize=15:fontcolor=0xff6b6b:enable='between(t,4.7,7.0)',
drawtext=fontfile=${SANS_FONT}:text='${BLOCKER}':x=780:y=526:fontsize=21:fontcolor=white:enable='between(t,4.7,7.0)',
drawbox=x=500:y=508:w=560:h=118:c=0x143026@0.96:t=fill:enable='gte(t,7.0)',
drawbox=x=500:y=508:w=8:h=118:c=0x2fd19a:t=fill:enable='gte(t,7.0)',
drawtext=fontfile=${MONO_FONT}:text='NEXT FOCUSED MISSION':x=536:y=532:fontsize=14:fontcolor=0x62e6b7:enable='gte(t,7.0)',
drawtext=fontfile=${SANS_FONT}:text='${MISSION}':x=536:y=568:fontsize=22:fontcolor=white:enable='gte(t,7.0)',
drawtext=fontfile=${MONO_FONT}:text='THEN RE-TEST UNDER A CHANGED CONDITION':x=536:y=602:fontsize=12:fontcolor=0x9bdcc5:enable='gte(t,7.0)',
drawtext=fontfile=${MONO_FONT}:text='ILLUSTRATIVE PRODUCT FILM - NO HIRING PREDICTION':x=64:y=670:fontsize=13:fontcolor=0x687386" \
    -an -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart "$OUTPUT_DIR/${OUTPUT_NAME}.mp4"
}

generate_role_route "data-route" "DATA / AI PROFESSIONAL" "QUANT" "INTERPRET" "ASSUMPTIONS" "SQL / PY" "TRANSFORM" "NULLS / SCALE" "DATA CASE" "FRAME" "METRIC CHOICE" "MODEL" "CHALLENGE" "LIMITATIONS" "FINAL" "TRANSLATE" "DECISION IMPACT" "Model choice loses strength under limitations" "Baseline - limitation - monitoring - evidence"
generate_role_route "core-route" "CORE ENGINEER" "APTITUDE" "CALCULATE" "UNITS / PACE" "FUNDAMENTALS" "RECALL" "CAUSAL LOGIC" "TECHNICAL" "APPLY" "CONSTRAINTS" "APPLICATION" "DIAGNOSE" "ROOT CAUSE" "FINAL" "OWN" "SAFETY / IMPACT" "The fix appears before the cause is verified" "Hypothesis - test - evidence - safe decision"
generate_role_route "analyst-route" "BUSINESS / DATA ANALYST" "QUANT" "REASON" "CONDITIONS" "DATA CASE" "QUESTION" "METRIC / SEGMENT" "SYNTHESIS" "PRIORITISE" "ONE DECISION" "CASE" "DEFEND" "ASSUMPTIONS" "FINAL" "INFLUENCE" "STAKEHOLDER FIT" "The analysis is right but hard to act on" "Insight - decision - objection - evidence"
generate_role_route "explore-route" "EXPLORE MY DIRECTION" "BASELINE" "NOTICE" "ENERGY / FIT" "REASONING" "SOLVE" "STRATEGY" "ROLE SAMPLE" "TRY" "TASK EVIDENCE" "EXPLAIN" "CLARIFY" "OWNERSHIP" "DIRECTION" "CHOOSE" "NEXT EXPERIMENT" "A role is chosen from pressure instead of evidence" "Compare task evidence - choose next experiment"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=0x07090f:s=1280x720:r=30:d=9" \
  -vf "drawgrid=w=64:h=64:t=1:c=0x71d4f5@0.08,
drawtext=fontfile=${MONO_FONT}:text='COMMUNICATION / LIVE REPAIR':x=64:y=46:fontsize=18:fontcolor=0x71d4f5,
drawtext=fontfile=${SANS_FONT}:text='The idea was strong. The structure hid it.':x=64:y=82:fontsize=38:fontcolor=white,
drawbox=x=64:y=166:w=540:h=432:c=0x111722:t=fill,
drawtext=fontfile=${MONO_FONT}:text='FIRST ATTEMPT / TRANSCRIPT':x=94:y=194:fontsize=14:fontcolor=0x78859a,
drawtext=fontfile=${SANS_FONT}:text='Basically... we built a platform':x=94:y=246:fontsize=24:fontcolor=0xe9eef8,
drawtext=fontfile=${SANS_FONT}:text='and um... it was faster because':x=94:y=292:fontsize=24:fontcolor=0xe9eef8,
drawtext=fontfile=${SANS_FONT}:text='we changed a few things...':x=94:y=338:fontsize=24:fontcolor=0xe9eef8,
drawtext=fontfile=${SANS_FONT}:text='the result was good.':x=94:y=384:fontsize=24:fontcolor=0xe9eef8,
drawbox=x=90:y=430:w=214:h=42:c=0x3a2025:t=fill:enable='between(t,2.2,5.9)',
drawtext=fontfile=${MONO_FONT}:text='OWNERSHIP MISSING':x=108:y=443:fontsize=14:fontcolor=0xff7b7b:enable='between(t,2.2,5.9)',
drawbox=x=318:y=430:w=208:h=42:c=0x3a3020:t=fill:enable='between(t,2.8,5.9)',
drawtext=fontfile=${MONO_FONT}:text='RESULT BURIED':x=338:y=443:fontsize=14:fontcolor=0xffbd63:enable='between(t,2.8,5.9)',
drawtext=fontfile=${MONO_FONT}:text='4 FILLERS / 1 LONG PAUSE':x=94:y=520:fontsize=14:fontcolor=0x78859a,
drawbox=x=644:y=166:w=572:h=432:c=0x0c1220:t=fill,
drawtext=fontfile=${MONO_FONT}:text='REPAIR FRAME':x=676:y=194:fontsize=14:fontcolor=0x7e97ff,
drawbox=x=676:y=236:w=236:h=68:c=0x15233f:t=fill:enable='gte(t,3.8)',
drawtext=fontfile=${MONO_FONT}:text='01  PROBLEM':x=698:y=254:fontsize=14:fontcolor=0x91a9ff:enable='gte(t,3.8)',
drawtext=fontfile=${SANS_FONT}:text='What had to change?':x=698:y=278:fontsize=18:fontcolor=white:enable='gte(t,3.8)',
drawbox=x=936:y=236:w=248:h=68:c=0x15233f:t=fill:enable='gte(t,4.4)',
drawtext=fontfile=${MONO_FONT}:text='02  MY DECISION':x=958:y=254:fontsize=14:fontcolor=0x91a9ff:enable='gte(t,4.4)',
drawtext=fontfile=${SANS_FONT}:text='What did I choose?':x=958:y=278:fontsize=18:fontcolor=white:enable='gte(t,4.4)',
drawbox=x=676:y=326:w=236:h=68:c=0x15233f:t=fill:enable='gte(t,5.0)',
drawtext=fontfile=${MONO_FONT}:text='03  WHY':x=698:y=344:fontsize=14:fontcolor=0x91a9ff:enable='gte(t,5.0)',
drawtext=fontfile=${SANS_FONT}:text='Why this approach?':x=698:y=368:fontsize=18:fontcolor=white:enable='gte(t,5.0)',
drawbox=x=936:y=326:w=248:h=68:c=0x143126:t=fill:enable='gte(t,5.6)',
drawtext=fontfile=${MONO_FONT}:text='04  RESULT':x=958:y=344:fontsize=14:fontcolor=0x58dfae:enable='gte(t,5.6)',
drawtext=fontfile=${SANS_FONT}:text='What changed?':x=958:y=368:fontsize=18:fontcolor=white:enable='gte(t,5.6)',
drawbox=x=676:y=430:w=508:h=108:c=0x18233b:t=fill:enable='gte(t,6.2)',
drawbox=x=676:y=430:w=8:h=108:c=0x2fd19a:t=fill:enable='gte(t,6.2)',
drawtext=fontfile=${MONO_FONT}:text='SECOND ATTEMPT / STRUCTURE PRESENT':x=708:y=452:fontsize=14:fontcolor=0x5de4b4:enable='gte(t,6.2)',
drawtext=fontfile=${SANS_FONT}:text='Now re-test with a different prompt.':x=708:y=486:fontsize=24:fontcolor=white:enable='gte(t,6.2)',
drawtext=fontfile=${MONO_FONT}:text='IMPROVEMENT IS NOT CLAIMED UNTIL IT TRANSFERS':x=708:y=516:fontsize=12:fontcolor=0xa2b2ca:enable='gte(t,6.2)',
drawbox=x='676+mod(t*112,500)':y=566:w=36:h='10+22*abs(sin(t*3.1))':c=0x71d4f5@0.9:t=fill,
drawtext=fontfile=${MONO_FONT}:text='OBSERVE - GUIDE - RETRY - VERIFY':x=64:y=660:fontsize=15:fontcolor=0x7e97ff" \
  -an -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart "$OUTPUT_DIR/live-repair.mp4"

ffmpeg -hide_banner -loglevel error -y \
  -f lavfi -i "color=c=0x05070d:s=1280x720:r=30:d=10" \
  -vf "drawgrid=w=80:h=80:t=1:c=0x315bff@0.10,
drawtext=fontfile=${MONO_FONT}:text='PLACEMENT TWIN / EVIDENCE ROUTING':x=64:y=46:fontsize=18:fontcolor=0x8ea5ff,
drawtext=fontfile=${SANS_FONT}:text='Many attempts. One career decision.':x=64:y=82:fontsize=40:fontcolor=white,
drawbox=x=74:y=202:w=240:h=92:c=0x141a27:t=fill,
drawtext=fontfile=${MONO_FONT}:text='APTITUDE':x=98:y=224:fontsize=14:fontcolor=0xf4a340,
drawtext=fontfile=${SANS_FONT}:text='Pressure stability':x=98:y=252:fontsize=20:fontcolor=white,
drawbox=x=74:y=420:w=240:h=92:c=0x141a27:t=fill,
drawtext=fontfile=${MONO_FONT}:text='TECHNICAL':x=98:y=442:fontsize=14:fontcolor=0x71d4f5,
drawtext=fontfile=${SANS_FONT}:text='Trade-off defence':x=98:y=470:fontsize=20:fontcolor=white,
drawbox=x=966:y=202:w=240:h=92:c=0x141a27:t=fill,
drawtext=fontfile=${MONO_FONT}:text='COMMUNICATION':x=990:y=224:fontsize=14:fontcolor=0x71d4f5,
drawtext=fontfile=${SANS_FONT}:text='Answer structure':x=990:y=252:fontsize=20:fontcolor=white,
drawbox=x=966:y=420:w=240:h=92:c=0x141a27:t=fill,
drawtext=fontfile=${MONO_FONT}:text='INTERVIEW':x=990:y=442:fontsize=14:fontcolor=0xff6b6b,
drawtext=fontfile=${SANS_FONT}:text='Follow-up depth':x=990:y=470:fontsize=20:fontcolor=white,
drawbox=x=486:y=218:w=308:h=282:c=0x0f1727:t=fill,
drawbox=x=494:y=226:w=292:h=266:c=0x315bff@0.08:t=fill,
drawtext=fontfile=${MONO_FONT}:text='TARGET ROLE':x=526:y=252:fontsize=14:fontcolor=0x8da4ff,
drawtext=fontfile=${SANS_FONT}:text='SOFTWARE':x=526:y=290:fontsize=42:fontcolor=white,
drawtext=fontfile=${SANS_FONT}:text='ENGINEER':x=526:y=338:fontsize=42:fontcolor=white,
drawtext=fontfile=${MONO_FONT}:text='0 LIVE SIGNALS':x=526:y=410:fontsize=16:fontcolor=0x6f7a8f:enable='lt(t,2.0)',
drawtext=fontfile=${MONO_FONT}:text='4 LIVE SIGNALS':x=526:y=410:fontsize=16:fontcolor=0x2fd19a:enable='gte(t,2.0)',
drawbox=x='314+min(t/2.0\,1)*172':y=244:w=172:h=3:c=0xf4a340@0.8:t=fill,
drawbox=x='314+min(t/2.5\,1)*172':y=462:w=172:h=3:c=0x71d4f5@0.8:t=fill,
drawbox=x=794:y=244:w='min(t/3.0\,1)*172':h=3:c=0x71d4f5@0.8:t=fill,
drawbox=x=794:y=462:w='min(t/3.5\,1)*172':h=3:c=0xff5c5c@0.8:t=fill,
drawbox=x='314+mod(t*150,172)':y=238:w=12:h=15:c=0xf4a340:t=fill:enable='lt(t,4.0)',
drawbox=x='794+mod(t*148,172)':y=456:w=12:h=15:c=0xff5c5c:t=fill:enable='lt(t,4.0)',
drawbox=x=422:y=548:w=436:h=104:c=0x371c24@0.98:t=fill:enable='between(t,4.2,7.0)',
drawbox=x=422:y=548:w=8:h=104:c=0xff5c5c:t=fill:enable='between(t,4.2,7.0)',
drawtext=fontfile=${MONO_FONT}:text='CURRENT BLOCKER':x=454:y=568:fontsize=14:fontcolor=0xff8585:enable='between(t,4.2,7.0)',
drawtext=fontfile=${SANS_FONT}:text='Defending decisions under pressure':x=454:y=602:fontsize=22:fontcolor=white:enable='between(t,4.2,7.0)',
drawbox=x=384:y=538:w=512:h=118:c=0x153127@0.98:t=fill:enable='gte(t,7.0)',
drawbox=x=384:y=538:w=8:h=118:c=0x2fd19a:t=fill:enable='gte(t,7.0)',
drawtext=fontfile=${MONO_FONT}:text='NEXT USEFUL MOVE / 12 MIN':x=420:y=560:fontsize=14:fontcolor=0x61e0b1:enable='gte(t,7.0)',
drawtext=fontfile=${SANS_FONT}:text='Defend why - alternative - failure - evidence':x=420:y=594:fontsize=22:fontcolor=white:enable='gte(t,7.0)',
drawtext=fontfile=${MONO_FONT}:text='THEN RE-TEST UNDER A NEW FOLLOW-UP':x=420:y=628:fontsize=13:fontcolor=0x9bdcc5:enable='gte(t,7.0)',
drawtext=fontfile=${MONO_FONT}:text='THE TWIN MOVES ONLY WHEN YOUR EVIDENCE MOVES':x=64:y=680:fontsize=14:fontcolor=0x7e97ff" \
  -an -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart "$OUTPUT_DIR/evidence-twin.mp4"

for FILM_NAME in career-route data-route core-route analyst-route explore-route live-repair evidence-twin; do
  ffmpeg -hide_banner -loglevel error -y -ss 0.2 -i "$OUTPUT_DIR/${FILM_NAME}.mp4" -frames:v 1 -vf "scale=1280:720" -c:v libwebp -quality 82 "$OUTPUT_DIR/${FILM_NAME}.webp"
done
