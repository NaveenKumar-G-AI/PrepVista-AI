"""
PrepVista - Branch-Specific Technical Taxonomy (HR Interview Intelligence
Report, Section 4 / Appendix Section 7, categories #62-141).

80 technical categories across 8 engineering branches (10 each), plus a
6-category generic fallback (PrepVista-internal, not from the report) for
students with no/unrecognized department.

This module is the SINGLE SOURCE OF TRUTH for "what counts as a branch" and
"what does that branch's technical module contain". Two consumers:

  - The question planner: selects technical-question categories for a
    session from get_technical_categories(department_code), instead of one
    generic technical pool for every student (Report Section 6.3 - the
    headline architectural change).
  - The rubric scorer: computes "Technical/Domain Knowledge" against the same
    branch-specific category set the planner drew from, so the score is
    comparable across students *within* a branch and meaningfully different
    *across* branches (a CSE student's score reflects DSA/OOP/OS/DBMS/CN; a
    Civil student's reflects structural analysis/geotechnical/estimation).

config.py imports DEPARTMENT_TECHNICAL_CATEGORIES / DEPARTMENT_DISPLAY_NAMES /
get_technical_categories from here and derives VALID_DEPARTMENTS from this
module's keys - add a 9th branch by editing only this file.

Each category dict has:
  id             stable snake_case identifier (used in DB rows / prompts /
                 analytics - do not rename once questions reference it;
                 deprecate and add a new id instead)
  label          human-readable category name (matches report table rows)
  core_topics    list of concept/topic strings to seed question generation
  question_angle hint string describing the typical question framing,
                 used directly in planner/LLM prompts
  weight_hint    "core" (default - normal sampling weight),
                 "light" (report describes this as lighter/conceptual-only
                 for freshers - de-prioritize in sampling), or
                 "niche" (report marks this "niche/advanced" - only surface
                 for product-company/specialized-track sessions, e.g. VLSI)
"""

from __future__ import annotations


# ── 4.1 CSE (Computer Science Engineering) ──────────────────────────────────
CSE_TECHNICAL_CATEGORIES: list[dict] = [
    {
        "id": "dsa",
        "label": "Data Structures & Algorithms",
        "core_topics": [
            "Arrays", "Linked lists", "Trees", "Graphs",
            "Stacks & queues", "Sorting & searching", "Recursion",
            "Dynamic programming",
        ],
        "question_angle": "Live coding (\"write a function to...\"), complexity analysis, trade-off discussion",
        "weight_hint": "core",
    },
    {
        "id": "oop",
        "label": "Object-Oriented Programming",
        "core_topics": [
            "Classes & objects", "Inheritance", "Polymorphism",
            "Encapsulation", "Abstraction",
        ],
        "question_angle": "\"Explain polymorphism with an example\"; design a small class hierarchy",
        "weight_hint": "core",
    },
    {
        "id": "os",
        "label": "Operating Systems",
        "core_topics": [
            "Processes vs threads", "Scheduling algorithms",
            "Memory management", "Deadlock", "Paging",
        ],
        "question_angle": "\"What happens when you run a program?\"; deadlock conditions",
        "weight_hint": "core",
    },
    {
        "id": "dbms_sql",
        "label": "DBMS & SQL",
        "core_topics": [
            "Normalization", "ACID properties", "Joins", "Indexing",
            "Transactions", "ER diagrams",
        ],
        "question_angle": "Live SQL query writing (joins, GROUP BY, subqueries), schema design",
        "weight_hint": "core",
    },
    {
        "id": "computer_networks",
        "label": "Computer Networks",
        "core_topics": [
            "OSI / TCP-IP model", "DNS", "HTTP/HTTPS", "Routing", "Sockets",
        ],
        "question_angle": "\"What happens when you type a URL into a browser?\"",
        "weight_hint": "core",
    },
    {
        "id": "sdlc",
        "label": "Software Engineering / SDLC",
        "core_topics": [
            "Agile/Scrum", "Testing types", "Version control workflows",
        ],
        "question_angle": "\"How does your team manage sprints?\"; Git workflow questions",
        "weight_hint": "core",
    },
    {
        "id": "system_design_basics",
        "label": "System Design Basics",
        "core_topics": [
            "Scalability", "Caching", "Load balancing", "Basic architecture",
        ],
        "question_angle": "For product companies: \"design a URL shortener / notification system\"",
        "weight_hint": "core",
    },
    {
        "id": "project_code_walkthrough",
        "label": "Project / Internship Code Walkthrough",
        "core_topics": [
            "Tech stack", "Architecture decisions", "Debugging stories",
        ],
        "question_angle": "\"Show me your GitHub\"; \"what was the hardest bug you fixed?\"",
        "weight_hint": "core",
    },
    {
        "id": "git_tooling",
        "label": "Tooling & Collaboration",
        "core_topics": [
            "Git/GitHub", "IDEs", "CI/CD basics",
        ],
        "question_angle": "\"Walk me through a Git workflow you've used\"",
        "weight_hint": "core",
    },
    {
        "id": "emerging_tech",
        "label": "Emerging Tech Awareness",
        "core_topics": [
            "Cloud basics (AWS/Azure/GCP)", "Microservices", "AI-assisted coding",
        ],
        "question_angle": "\"Have you used any cloud services?\"; \"how do you use AI coding tools?\"",
        "weight_hint": "core",
    },
]


# ── 4.2 AI & DS (Artificial Intelligence & Data Science) ─────────────────────
AIDS_TECHNICAL_CATEGORIES: list[dict] = [
    {
        "id": "statistics_probability",
        "label": "Statistics & Probability",
        "core_topics": [
            "Mean / median / mode", "Distributions", "Hypothesis testing",
            "Correlation vs causation", "P-values",
        ],
        "question_angle": "\"Explain p-value to a non-technical person\"; \"what's the difference between correlation and causation?\"",
        "weight_hint": "core",
    },
    {
        "id": "python_r_for_data",
        "label": "Python / R for Data",
        "core_topics": [
            "Pandas", "NumPy", "Data wrangling syntax",
        ],
        "question_angle": "Live/whiteboard: \"filter and group this dataset\"",
        "weight_hint": "core",
    },
    {
        "id": "eda_feature_engineering",
        "label": "EDA & Feature Engineering",
        "core_topics": [
            "Missing-value handling", "Outlier detection", "Encoding", "Scaling",
        ],
        "question_angle": "\"How would you handle missing data in this column?\"",
        "weight_hint": "core",
    },
    {
        "id": "core_ml_algorithms",
        "label": "Core ML Algorithms",
        "core_topics": [
            "Linear / logistic regression", "Decision trees", "K-means", "K-NN",
        ],
        "question_angle": "\"Explain how a decision tree splits\"; \"when would you use clustering?\"",
        "weight_hint": "core",
    },
    {
        "id": "model_evaluation_metrics",
        "label": "Model Evaluation Metrics",
        "core_topics": [
            "Accuracy", "Precision/recall", "F1", "RMSE", "Confusion matrix", "ROC-AUC",
        ],
        "question_angle": "\"Your model has 95% accuracy but is useless - why?\" (imbalanced data)",
        "weight_hint": "core",
    },
    {
        "id": "sql_data_querying",
        "label": "SQL & Data Querying",
        "core_topics": [
            "Joins", "Window functions", "Aggregations",
        ],
        "question_angle": "Translating a business question into SQL",
        "weight_hint": "core",
    },
    {
        "id": "data_visualization",
        "label": "Data Visualization",
        "core_topics": [
            "Choosing the right chart", "Dashboards (Tableau/Power BI/matplotlib)",
        ],
        "question_angle": "\"Which chart would you use to show this trend, and why?\"",
        "weight_hint": "core",
    },
    {
        "id": "big_data_pipeline_basics",
        "label": "Big Data / Pipeline Basics",
        "core_topics": [
            "Batch vs streaming", "Basic Spark/Hadoop awareness", "ETL concept",
        ],
        "question_angle": "\"What's the difference between ETL and ELT?\"",
        "weight_hint": "core",
    },
    {
        "id": "business_case_study",
        "label": "Business Case-Study",
        "core_topics": [
            "Translating a vague business problem into a data approach",
        ],
        "question_angle": "\"Sales dropped 20% last quarter - how would you investigate using data?\"",
        "weight_hint": "core",
    },
    {
        "id": "data_ethics_privacy",
        "label": "Data Ethics & Privacy",
        "core_topics": [
            "Bias in data", "Consent", "Anonymization", "Regulatory awareness",
        ],
        "question_angle": "\"How would you handle a dataset containing sensitive personal information?\"",
        "weight_hint": "core",
    },
]


# ── 4.3 AI & ML (Artificial Intelligence & Machine Learning) ─────────────────
AIML_TECHNICAL_CATEGORIES: list[dict] = [
    {
        "id": "learning_paradigms",
        "label": "Supervised / Unsupervised / RL",
        "core_topics": [
            "Classification vs regression vs clustering vs reward-based learning",
        ],
        "question_angle": "\"Give a real-world example of each learning type\"",
        "weight_hint": "core",
    },
    {
        "id": "bias_variance_regularization",
        "label": "Bias-Variance & Regularization",
        "core_topics": [
            "Overfitting / underfitting", "L1/L2 regularization", "Cross-validation",
        ],
        "question_angle": "\"Training accuracy is 99% but test accuracy is 60% - why, and how do you fix it?\"",
        "weight_hint": "core",
    },
    {
        "id": "neural_networks_dl",
        "label": "Neural Networks & Deep Learning",
        "core_topics": [
            "Perceptrons", "Activation functions", "Backpropagation", "CNN/RNN basics",
        ],
        "question_angle": "\"Explain backpropagation in simple terms\"",
        "weight_hint": "core",
    },
    {
        "id": "nlp_fundamentals",
        "label": "NLP Fundamentals",
        "core_topics": [
            "Tokenization", "Embeddings", "Sentiment analysis", "Transformers (conceptual)",
        ],
        "question_angle": "\"How would a sentiment-analysis model work on product reviews?\"",
        "weight_hint": "core",
    },
    {
        "id": "cv_fundamentals",
        "label": "Computer Vision Fundamentals",
        "core_topics": [
            "Image classification", "CNN layers", "Object detection (conceptual)",
        ],
        "question_angle": "\"How does a CNN 'see' an image differently from a human?\"",
        "weight_hint": "core",
    },
    {
        "id": "genai_llm_rag",
        "label": "Generative AI / LLMs / Prompt Engineering / RAG",
        "core_topics": [
            "Tokens", "Embeddings", "Hallucination",
            "Fine-tuning vs RAG vs prompt engineering", "Zero/few-shot learning",
        ],
        "question_angle": "\"What is RAG and why does it reduce hallucination?\"; \"write a good prompt for X task\" - the fastest-growing topic for 2026",
        "weight_hint": "core",
    },
    {
        "id": "mlops_deployment_basics",
        "label": "MLOps & Deployment Basics",
        "core_topics": [
            "Model versioning", "Monitoring", "Drift", "Basic API serving",
        ],
        "question_angle": "\"How would you know if your deployed model's performance is degrading?\"",
        "weight_hint": "core",
    },
    {
        "id": "math_foundations",
        "label": "Math Foundations",
        "core_topics": [
            "Linear algebra (vectors/matrices)", "Calculus (gradients)", "Probability",
        ],
        "question_angle": "\"What role do gradients play in training a model?\"",
        "weight_hint": "core",
    },
    {
        "id": "responsible_ethical_ai",
        "label": "Responsible / Ethical AI",
        "core_topics": [
            "Bias", "Fairness", "Explainability", "AI safety basics",
        ],
        "question_angle": "\"How would you check if your model is biased against a group?\"",
        "weight_hint": "core",
    },
    {
        "id": "project_research_discussion",
        "label": "Project / Research Discussion",
        "core_topics": [
            "Dataset choices", "Model choices", "Results", "Limitations",
        ],
        "question_angle": "\"Why did you choose this model architecture over alternatives?\"",
        "weight_hint": "core",
    },
]


# ── 4.4 ECE (Electronics & Communication Engineering) ────────────────────────
ECE_TECHNICAL_CATEGORIES: list[dict] = [
    {
        "id": "analog_electronics",
        "label": "Analog Electronics",
        "core_topics": [
            "Diodes", "BJTs/FETs", "Op-amps", "Rectifiers", "Amplifiers",
        ],
        "question_angle": "\"Explain the working of a half-wave rectifier\"",
        "weight_hint": "core",
    },
    {
        "id": "digital_electronics",
        "label": "Digital Electronics",
        "core_topics": [
            "Logic gates", "Combinational/sequential circuits", "Flip-flops",
            "Counters", "FSMs", "Number systems",
        ],
        "question_angle": "\"Difference between a latch and a flip-flop\"; design a simple counter",
        "weight_hint": "core",
    },
    {
        "id": "signals_systems",
        "label": "Signals & Systems",
        "core_topics": [
            "Fourier transform", "Sampling theorem", "Convolution", "Filters",
        ],
        "question_angle": "\"Why do we need the sampling theorem?\"",
        "weight_hint": "core",
    },
    {
        "id": "communication_systems",
        "label": "Communication Systems",
        "core_topics": [
            "Modulation (AM/FM/PM)", "Multiplexing (TDMA/FDMA/CDMA)",
            "Antennas", "Satellite basics",
        ],
        "question_angle": "\"Difference between AM and FM\"; \"what is multiplexing and why is it needed?\"",
        "weight_hint": "core",
    },
    {
        "id": "vlsi_design",
        "label": "VLSI Design",
        "core_topics": [
            "CMOS basics", "RTL design", "FPGA/ASIC flow",
        ],
        "question_angle": "For VLSI-track interviews: \"explain the CMOS inverter\"",
        "weight_hint": "niche",
    },
    {
        "id": "embedded_microcontrollers",
        "label": "Embedded Systems & Microcontrollers",
        "core_topics": [
            "Microprocessor architecture (8085/8086)",
            "Microcontrollers (8051/ARM)", "Interfacing", "RTOS basics",
        ],
        "question_angle": "\"How would you interface a sensor with a microcontroller?\"",
        "weight_hint": "core",
    },
    {
        "id": "electromagnetic_theory",
        "label": "Electromagnetic Theory",
        "core_topics": [
            "Wave propagation", "Transmission lines (conceptual)",
        ],
        "question_angle": "Usually lighter for freshers; conceptual only",
        "weight_hint": "light",
    },
    {
        "id": "iot_networking",
        "label": "Networking / IoT Crossover",
        "core_topics": [
            "Basic IoT architecture", "Sensor-to-cloud pipeline",
        ],
        "question_angle": "\"Describe an IoT system end-to-end\"",
        "weight_hint": "core",
    },
    {
        "id": "hardware_project",
        "label": "Project-Based (Hardware/Embedded)",
        "core_topics": [
            "Circuit design", "PCB", "Sensor integration", "Hardware-software interaction",
        ],
        "question_angle": "\"Walk me through your hardware project - what broke and how did you debug it?\"",
        "weight_hint": "core",
    },
    {
        "id": "emerging_trends_ece",
        "label": "Emerging Trends",
        "core_topics": [
            "5G", "Semiconductor manufacturing growth", "IoT/edge devices",
        ],
        "question_angle": "\"What do you know about the growth of the semiconductor industry?\"",
        "weight_hint": "core",
    },
]


# ── 4.5 EEE (Electrical & Electronics Engineering) ───────────────────────────
EEE_TECHNICAL_CATEGORIES: list[dict] = [
    {
        "id": "circuit_theory",
        "label": "Circuit Theory",
        "core_topics": [
            "Ohm's / Kirchhoff's laws",
            "Network theorems (Thevenin/Norton/superposition)", "AC/DC analysis",
        ],
        "question_angle": "\"State and apply KVL/KCL to a simple circuit\"",
        "weight_hint": "core",
    },
    {
        "id": "electrical_machines",
        "label": "Electrical Machines",
        "core_topics": [
            "Transformers", "DC/AC motors", "Generators/alternators", "Induction machines",
        ],
        "question_angle": "\"Explain the working principle of a transformer\"; motor-type comparisons",
        "weight_hint": "core",
    },
    {
        "id": "power_systems",
        "label": "Power Systems",
        "core_topics": [
            "Generation/transmission/distribution", "Single- vs three-phase",
            "Fault analysis", "Protection",
        ],
        "question_angle": "\"Why is power transmitted at high voltage?\"",
        "weight_hint": "core",
    },
    {
        "id": "power_electronics",
        "label": "Power Electronics",
        "core_topics": [
            "Rectifiers", "Inverters", "Converters (buck/boost)", "Drives",
        ],
        "question_angle": "\"Difference between an inverter and a converter\"",
        "weight_hint": "core",
    },
    {
        "id": "control_systems",
        "label": "Control Systems",
        "core_topics": [
            "Transfer functions", "Block diagrams", "Stability (conceptual)", "PID basics",
        ],
        "question_angle": "\"What does a PID controller do?\"",
        "weight_hint": "core",
    },
    {
        "id": "measurements_instrumentation",
        "label": "Measurements & Instrumentation",
        "core_topics": [
            "Meters", "Sensors", "Calibration basics",
        ],
        "question_angle": "\"How would you measure power factor?\"",
        "weight_hint": "core",
    },
    {
        "id": "basic_electronics_eee",
        "label": "Basic Electronics",
        "core_topics": [
            "Diodes", "Transistors", "Basic digital logic",
        ],
        "question_angle": "Often blended with ECE-style basic questions",
        "weight_hint": "light",
    },
    {
        "id": "renewable_smart_grid",
        "label": "Renewable Energy & Smart Grid",
        "core_topics": [
            "Solar/wind integration", "Smart meters", "Grid modernization",
        ],
        "question_angle": "\"How does a smart grid differ from a traditional grid?\" - major 2026 growth area",
        "weight_hint": "core",
    },
    {
        "id": "ev_battery_tech",
        "label": "EV & Battery Technology",
        "core_topics": [
            "EV motor types", "Battery management systems (conceptual)",
        ],
        "question_angle": "\"What's special about an EV's electrical system compared to a regular car?\"",
        "weight_hint": "core",
    },
    {
        "id": "simulation_project",
        "label": "Project-Based (Simulation Tools)",
        "core_topics": [
            "Simulation tools (MATLAB/Simulink)", "Design projects",
        ],
        "question_angle": "\"Walk me through your simulation project\"",
        "weight_hint": "core",
    },
]


# ── 4.6 Mechanical Engineering ────────────────────────────────────────────────
MECH_TECHNICAL_CATEGORIES: list[dict] = [
    {
        "id": "thermodynamics",
        "label": "Thermodynamics",
        "core_topics": [
            "Laws of thermodynamics", "Cycles (Carnot, Otto, Diesel, Rankine)", "Efficiency",
        ],
        "question_angle": "\"Explain the second law of thermodynamics with an example\"",
        "weight_hint": "core",
    },
    {
        "id": "fluid_mechanics",
        "label": "Fluid Mechanics",
        "core_topics": [
            "Bernoulli's equation", "Viscosity", "Types of flow", "Pumps",
        ],
        "question_angle": "\"Explain Bernoulli's principle with a real-world example\"",
        "weight_hint": "core",
    },
    {
        "id": "heat_transfer",
        "label": "Heat Transfer",
        "core_topics": [
            "Conduction", "Convection", "Radiation", "Heat exchangers",
        ],
        "question_angle": "\"Difference between conduction and convection\"",
        "weight_hint": "core",
    },
    {
        "id": "strength_of_materials",
        "label": "Strength of Materials",
        "core_topics": [
            "Stress", "Strain", "Bending moment", "Shear force", "Factor of safety",
        ],
        "question_angle": "\"Define stress and strain and how they're related\"",
        "weight_hint": "core",
    },
    {
        "id": "manufacturing_processes",
        "label": "Manufacturing Processes",
        "core_topics": [
            "Casting", "Welding", "Machining", "Forming", "Additive manufacturing (3D printing)",
        ],
        "question_angle": "\"Compare welding and brazing\"; \"what's the advantage of 3D printing?\"",
        "weight_hint": "core",
    },
    {
        "id": "machine_design_tom",
        "label": "Machine Design / Theory of Machines",
        "core_topics": [
            "Gears", "Bearings", "Linkages", "Cams", "Basic vibrations",
        ],
        "question_angle": "\"Difference between a gear and a sprocket\"",
        "weight_hint": "core",
    },
    {
        "id": "cad_cam_cae",
        "label": "CAD/CAM/CAE Tools",
        "core_topics": [
            "SolidWorks/AutoCAD/CATIA", "Simulation basics",
        ],
        "question_angle": "\"Walk me through a design you modeled in CAD\"",
        "weight_hint": "core",
    },
    {
        "id": "mech_project",
        "label": "Project-Based (Design/Manufacturing/Automation)",
        "core_topics": [
            "Design / manufacturing / automation / robotics projects",
        ],
        "question_angle": "\"What manufacturing process would you choose for this part, and why?\"",
        "weight_hint": "core",
    },
    {
        "id": "industry_4_automation",
        "label": "Industry 4.0 / Automation",
        "core_topics": [
            "Robotics", "Automation", "Smart manufacturing", "Predictive maintenance",
        ],
        "question_angle": "\"How is automation changing manufacturing roles?\"",
        "weight_hint": "core",
    },
    {
        "id": "comparative_application",
        "label": "Comparative / Application Questions",
        "core_topics": [
            "Pairwise comparisons (pneumatic vs hydraulic, etc.)",
        ],
        "question_angle": "\"Pneumatic vs. hydraulic systems - when would you use each?\"",
        "weight_hint": "core",
    },
]


# ── 4.7 Civil Engineering ──────────────────────────────────────────────────────
CIVIL_TECHNICAL_CATEGORIES: list[dict] = [
    {
        "id": "structural_analysis_design",
        "label": "Structural Analysis & Design",
        "core_topics": [
            "RCC design basics", "Steel structures", "Load types",
            "Working-stress vs limit-state design",
        ],
        "question_angle": "\"Explain working stress vs limit state design\"",
        "weight_hint": "core",
    },
    {
        "id": "geotechnical_engineering",
        "label": "Geotechnical Engineering",
        "core_topics": [
            "Soil types", "Bearing capacity", "Foundation types", "Settlement",
        ],
        "question_angle": "\"How would you choose a foundation for a given soil type?\"",
        "weight_hint": "core",
    },
    {
        "id": "surveying",
        "label": "Surveying",
        "core_topics": [
            "Levelling", "Total station", "GPS/GIS basics", "Contouring",
        ],
        "question_angle": "\"Which surveying instruments have you used, and for what?\"",
        "weight_hint": "core",
    },
    {
        "id": "construction_materials",
        "label": "Construction Materials",
        "core_topics": [
            "Cement grades (OPC 43 vs 53)", "Concrete mix design", "Admixtures",
        ],
        "question_angle": "\"What factors affect concrete strength?\"",
        "weight_hint": "core",
    },
    {
        "id": "estimation_costing_qs",
        "label": "Estimation, Costing & Quantity Surveying",
        "core_topics": [
            "BoQ", "Bar bending schedule (BBS)", "Rate analysis", "Billing",
        ],
        "question_angle": "\"Walk me through how you'd estimate quantities for a slab\"",
        "weight_hint": "core",
    },
    {
        "id": "construction_mgmt_planning",
        "label": "Construction Management & Planning",
        "core_topics": [
            "Scheduling (Gantt/CPM)", "Tendering", "Contracts",
        ],
        "question_angle": "\"How do you prioritize tasks under a tight handover deadline?\"",
        "weight_hint": "core",
    },
    {
        "id": "transportation_engineering",
        "label": "Transportation Engineering",
        "core_topics": [
            "Road design basics", "Traffic concepts",
        ],
        "question_angle": "\"What factors go into designing a road's geometry?\"",
        "weight_hint": "core",
    },
    {
        "id": "environmental_sustainability",
        "label": "Environmental & Sustainability",
        "core_topics": [
            "Green building concepts", "Waste management", "Sustainable materials",
        ],
        "question_angle": "\"What sustainable practices would you bring to a construction site?\"",
        "weight_hint": "core",
    },
    {
        "id": "bim_software_tools",
        "label": "BIM & Software Tools",
        "core_topics": [
            "AutoCAD", "Revit", "STAAD Pro", "BIM workflows",
        ],
        "question_angle": "\"What BIM tools have you used in coursework or projects?\"",
        "weight_hint": "core",
    },
    {
        "id": "site_safety_practical",
        "label": "Site Safety & Practical Scenarios",
        "core_topics": [
            "PPE", "Safety protocols", "On-site problem-solving",
        ],
        "question_angle": "\"Describe a time you solved a site problem with limited information\"",
        "weight_hint": "core",
    },
]


# ── 4.8 Cybersecurity ─────────────────────────────────────────────────────────
CYBER_TECHNICAL_CATEGORIES: list[dict] = [
    {
        "id": "networking_protocols",
        "label": "Networking & Protocol Fundamentals",
        "core_topics": [
            "TCP/IP", "DNS", "Firewalls", "VPNs", "Ports/protocols",
        ],
        "question_angle": "\"Explain how a firewall decides what traffic to block\"",
        "weight_hint": "core",
    },
    {
        "id": "cia_triad",
        "label": "CIA Triad & Core Principles",
        "core_topics": [
            "Confidentiality", "Integrity", "Availability",
            "Defense-in-depth", "Least privilege",
        ],
        "question_angle": "\"Give a real-world example of each part of the CIA triad\"",
        "weight_hint": "core",
    },
    {
        "id": "cryptography",
        "label": "Cryptography",
        "core_topics": [
            "Symmetric vs asymmetric encryption", "Hashing", "Certificates",
        ],
        "question_angle": "\"Difference between encryption and hashing\"",
        "weight_hint": "core",
    },
    {
        "id": "os_endpoint_security",
        "label": "OS & Endpoint Security",
        "core_topics": [
            "Permissions", "Malware types", "Antivirus/EDR basics",
        ],
        "question_angle": "\"How would you investigate a suspicious process on a machine?\"",
        "weight_hint": "core",
    },
    {
        "id": "web_app_security",
        "label": "Web Application Security",
        "core_topics": [
            "OWASP Top 10", "SQL injection", "XSS", "Authentication flaws",
        ],
        "question_angle": "\"Explain SQL injection and how to prevent it\"",
        "weight_hint": "core",
    },
    {
        "id": "siem_soc_tools",
        "label": "SIEM/SOC Tools & Threat Detection",
        "core_topics": [
            "Splunk/QRadar/Sentinel basics", "Log analysis", "Wireshark/Nmap",
        ],
        "question_angle": "\"How would you use Wireshark to investigate unusual traffic?\"",
        "weight_hint": "core",
    },
    {
        "id": "incident_response_forensics",
        "label": "Incident Response & Forensics",
        "core_topics": [
            "IR lifecycle (identify-contain-eradicate-recover)", "Evidence handling",
        ],
        "question_angle": "\"Walk me through your steps if you detect a breach in progress\"",
        "weight_hint": "core",
    },
    {
        "id": "cloud_security",
        "label": "Cloud Security",
        "core_topics": [
            "Cloud misconfigurations", "IAM", "Shared-responsibility model",
        ],
        "question_angle": "\"What's a common cloud security misconfiguration, and how would you find it?\"",
        "weight_hint": "core",
    },
    {
        "id": "compliance_frameworks_ethics",
        "label": "Compliance, Frameworks & Ethics",
        "core_topics": [
            "MITRE ATT&CK", "Data-protection basics",
            "Ethical-hacking boundaries (scope/authorization)",
        ],
        "question_angle": "\"What's the difference between ethical hacking and illegal hacking?\"",
        "weight_hint": "core",
    },
    {
        "id": "certs_continuous_learning",
        "label": "Certifications & Continuous Learning",
        "core_topics": [
            "Security+", "CEH", "Home-lab projects",
        ],
        "question_angle": "\"What have you set up in your home lab, and what did you learn from it?\"",
        "weight_hint": "core",
    },
]


# ── Generic Fallback (PrepVista-internal - NOT from the report) ──────────────
# Used when a student's department is missing or doesn't normalize to one of
# the 8 codes above (e.g. an individual signup who skipped the field, or a CSV
# row with an unrecognized department string pending admin review). Lighter
# and broader than a real branch module - 6 categories instead of 10, biased
# toward general IT/programming readiness since the report notes ECE/EEE/Mech/
# Civil grads who go into IT roles get "Section 3/4.1-style questions" instead
# of deep core-branch technical rounds.
GENERIC_TECHNICAL_CATEGORIES: list[dict] = [
    {
        "id": "programming_fundamentals",
        "label": "Programming Fundamentals",
        "core_topics": [
            "Variables & data types", "Control flow", "Functions",
            "Basic OOP concepts", "One language in depth (C/C++/Python/Java)",
        ],
        "question_angle": "\"Write a simple program to...\"; explain a basic concept in your primary language",
        "weight_hint": "core",
    },
    {
        "id": "problem_solving_logic",
        "label": "Problem Solving & Logic Building",
        "core_topics": [
            "Breaking a problem into steps", "Basic algorithmic thinking", "Pseudocode",
        ],
        "question_angle": "Walk through your approach to a simple logic problem before coding it",
        "weight_hint": "core",
    },
    {
        "id": "core_branch_fundamentals_light",
        "label": "Core Branch Fundamentals (Light)",
        "core_topics": [
            "2-3 foundational concepts from the student's own branch, kept conceptual",
        ],
        "question_angle": "\"Explain [a core concept from your branch] in simple terms\" - depth calibrated lighter than a full branch-specific interview",
        "weight_hint": "light",
    },
    {
        "id": "project_tools_walkthrough",
        "label": "Project & Tools Walkthrough",
        "core_topics": [
            "Academic / major project", "Software or tools used (CAD, MATLAB, Excel, etc. as relevant)",
            "Role and contribution",
        ],
        "question_angle": "\"Walk me through your final-year project and the tools you used\"",
        "weight_hint": "core",
    },
    {
        "id": "it_software_crossover",
        "label": "IT/Software Crossover Basics",
        "core_topics": [
            "Very basic DBMS (what is a database)",
            "Very basic networking (what is the internet/an IP address)",
            "Basic Excel/data handling",
        ],
        "question_angle": "Light, IT-readiness questions for non-CS branches considering software/IT roles",
        "weight_hint": "light",
    },
    {
        "id": "industry_domain_awareness",
        "label": "Industry & Domain Awareness",
        "core_topics": [
            "Recent developments in the student's field", "Major employers in that domain",
        ],
        "question_angle": "\"What's a recent development in your field that interests you?\"",
        "weight_hint": "core",
    },
]


# ── Aggregation ────────────────────────────────────────────────────────────────
DEPARTMENT_TECHNICAL_CATEGORIES: dict[str, list[dict]] = {
    "cse": CSE_TECHNICAL_CATEGORIES,
    "aids": AIDS_TECHNICAL_CATEGORIES,
    "aiml": AIML_TECHNICAL_CATEGORIES,
    "ece": ECE_TECHNICAL_CATEGORIES,
    "eee": EEE_TECHNICAL_CATEGORIES,
    "mech": MECH_TECHNICAL_CATEGORIES,
    "civil": CIVIL_TECHNICAL_CATEGORIES,
    "cyber": CYBER_TECHNICAL_CATEGORIES,
    "_generic": GENERIC_TECHNICAL_CATEGORIES,
}

DEPARTMENT_DISPLAY_NAMES: dict[str, str] = {
    "cse": "Computer Science Engineering",
    "aids": "AI & Data Science",
    "aiml": "AI & Machine Learning",
    "ece": "Electronics & Communication Engineering",
    "eee": "Electrical & Electronics Engineering",
    "mech": "Mechanical Engineering",
    "civil": "Civil Engineering",
    "cyber": "Cybersecurity",
}


def get_technical_categories(department_code: str | None) -> list[dict]:
    """
    Return the 10-category branch technical taxonomy for a department code,
    or the 6-category generic fallback if department_code is None/unrecognized.

    Returns shallow copies of the category dicts so callers can freely pop
    entries from the returned list (e.g. tracking "already asked this
    session") without mutating the shared module-level data. Do NOT mutate
    a returned dict's "core_topics" list in place - it is shared by reference.
    """
    code = (department_code or "").strip().lower()
    categories = DEPARTMENT_TECHNICAL_CATEGORIES.get(code, DEPARTMENT_TECHNICAL_CATEGORIES["_generic"])
    return [dict(c) for c in categories]


def list_all_categories() -> list[dict]:
    """
    Flat list of all 86 categories (80 branch-specific + 6 generic), each
    tagged with its department_code. Mirrors the report's Appendix Section 7
    "master category index" framing - usable as a content/question-bank
    seeding checklist (e.g. "generate N question variants per row").
    """
    flat: list[dict] = []
    for dept_code, categories in DEPARTMENT_TECHNICAL_CATEGORIES.items():
        for cat in categories:
            row = dict(cat)
            row["department_code"] = dept_code
            flat.append(row)
    return flat