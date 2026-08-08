const group = (category, expectedTools, questions, extra = {}) =>
  questions.map((question, index) => ({ id: `${category}-${index + 1}`, category, language: /[\u0600-\u06FF]/.test(question) ? "ar" : "en", question, expected_tools: expectedTools, ...extra }));

export const evaluationDataset = [
  ...group("busy_quiet_days", ["get_daily_sales"], [
    "How busy are we today?", "Are sales quiet today?", "Give me today's order summary", "How is the restaurant performing today?",
    "هل المطعم مزدحم اليوم؟", "هل المبيعات هادئة اليوم؟", "أعطني ملخص طلبات اليوم", "كيف أداء المطعم اليوم؟"
  ]),
  ...group("menu_profitability", ["get_low_performance_items"], [
    "Which dish is losing money?", "Show the weakest menu margins", "What menu item hurts profit?", "Which dishes underperform?",
    "ما الطبق الذي يسبب خسارة؟", "اعرض أضعف هوامش القائمة", "أي طبق يضر الأرباح؟", "ما الأطباق ضعيفة الأداء؟"
  ]),
  ...group("low_inventory", ["get_inventory_status"], [
    "What stock is running out?", "Show low inventory", "What ingredients need reordering?", "Will anything run out tonight?",
    "ما المخزون الذي سينفد؟", "اعرض عناصر المخزون الناقصة", "ما المكونات التي تحتاج إعادة طلب؟", "هل سينفد شيء الليلة؟"
  ]),
  ...group("missing_data", [], [
    "What was customer satisfaction last year?", "How much food waste did we record?", "Compare us with the restaurant next door", "What will the weather do to patio sales?",
    "ما مستوى رضا العملاء العام الماضي؟", "كم هدر الطعام المسجل؟", "قارن مطعمي بالمطعم المجاور", "كيف سيؤثر الطقس على مبيعات الجلسات الخارجية؟"
  ], { must_not_invent_numbers: true }),
  ...group("refund_anomalies", ["get_refund_summary"], [
    "Are refunds unusually high this week?", "How much did we refund this month?", "What are the top refund reasons?", "Review today's refunds",
    "هل المرتجعات مرتفعة هذا الأسبوع؟", "كم مبلغ الاسترداد هذا الشهر؟", "ما أسباب الاسترداد الأكثر شيوعاً؟", "راجع عمليات الاسترداد اليوم"
  ]),
  ...group("staffing_decisions", ["get_daily_sales", "suggest_staffing"], [
    "Do we need more staff tonight?", "Should I add a server for dinner?", "Is standard staffing enough today?", "How many cooks do we need tonight?",
    "هل أحتاج موظفين إضافيين الليلة؟", "هل أضيف نادلاً للعشاء؟", "هل عدد الموظفين المعتاد كافٍ اليوم؟", "كم طباخاً نحتاج الليلة؟"
  ]),
  ...group("bilingual_broad_decisions", ["get_daily_sales", "get_low_performance_items", "get_inventory_status"], [
    "What needs my attention?", "What is the top priority today?", "Where is the biggest operational risk?", "Give me the manager brief",
    "ما الذي يحتاج إلى انتباهي؟", "ما الأولوية اليوم؟", "أين أكبر خطر تشغيلي؟", "أعطني موجز المدير"
  ]),
  ...group("menu_actions_requiring_confirmation", ["flag_menu_item"], [
    "Deactivate the Lobster Pasta dish", "Disable this menu item", "أوقف طبق Lobster Pasta", "عطّل هذا العنصر"
  ], { requires_confirmation: true }),
  ...group("report_actions_requiring_confirmation", ["create_report"], [
    "Create a weekly report", "Create today's operating report", "أنشئ تقرير الأسبوع", "أنشئ تقرير تشغيل اليوم"
  ], { requires_confirmation: true }),
  ...group("knowledge_grounded_human_answers", ["search_knowledge_base"], [
    "Answer this like a human manager using the training book",
    "What does the restaurant manager handbook say about handling complaints?",
    "Use the conversation guidance to make your answer more logical",
    "What clarifying question should the AI ask before changing staffing?",
    "أجبني بطريقة بشرية ومنطقية من دليل التدريب",
    "ماذا يقول كتاب إدارة المطاعم عن شكاوى العملاء؟",
    "استخدم إرشادات المحادثة لتحسين الإجابة",
    "ما سؤال الاستيضاح المناسب قبل تغيير عدد الموظفين؟"
  ]),
  ...group("language_capabilities", [], [
    "Can you speak Arabic?",
    "Do you answer in Arabic?",
    "Can I talk to you in English and Arabic?",
    "What languages do you understand?"
  ]),
  ...group("real_data_connection_questions", [], [
    "Is it real data?",
    "I need real data",
    "How do I connect my real restaurant data?",
    "Can I upload POS sales data?",
    "Is this using my actual restaurant data?",
    "What data do you need from my restaurant?"
  ], { must_include: ["sample restaurant data", "Connect real data", "POS"] }),
  ...group("general_manager_advice", [], [
    "How can I reduce food waste?",
    "How should I handle a bad customer complaint?",
    "Give me a marketing plan for more customers",
    "Should I raise menu prices?",
    "How do I train my waiters better?",
    "How can I improve my restaurant?"
  ], { must_include: ["Direct answer", "Recommended"] }),
  { id: "logic-arithmetic-1", category: "restaurant_logic", language: "en", question: "A restaurant has 120 chicken portions. It sells 35 at lunch and 48 at dinner. Ten portions are damaged. How many usable portions remain?", expected_tools: [], must_include: ["27", "120", "35", "48", "10"] },
  { id: "logic-arithmetic-2", category: "restaurant_logic", language: "en", question: "We have 30 tables. Twenty tables seat four people and ten tables seat two people. What is the restaurant's maximum seating capacity?", expected_tools: [], must_include: ["100", "20 tables", "10 tables"] },
  { id: "logic-arithmetic-3", category: "restaurant_logic", language: "en", question: "Five waiters can serve 75 customers per hour equally. How many customers should each waiter serve?", expected_tools: [], must_include: ["15 customers", "75", "5"] },
  { id: "logic-operations-1", category: "restaurant_logic", language: "en", question: "A waiter is absent during the busiest period. Should the manager close five tables or redistribute the tables among the remaining staff? Explain your decision.", expected_tools: [], must_include: ["Do not choose blindly", "remaining staff capacity", "service quality"] },
  { id: "logic-inventory-1", category: "restaurant_logic", language: "en", question: "We normally use 20 kg of rice daily. Current stock is 45 kg, and the supplier needs two days to deliver. Should we order today?", expected_tools: [], must_include: ["Yes", "40 kg", "5 kg"] },
  { id: "logic-margin-1", category: "restaurant_logic", language: "en", question: "A dish costs $8 to prepare and is sold for $12. What is the profit per dish and the profit margin based on the selling price?", expected_tools: [], must_include: ["$4", "33.3%"] },
  { id: "logic-safety-1", category: "restaurant_logic", language: "en", question: "A customer says they have a severe peanut allergy, but the selected meal contains peanut sauce. What should the restaurant manager recommend?", expected_tools: [], must_include: ["Do not serve", "peanut-free", "cross-contamination"] },
  { id: "logic-kitchen-1", category: "restaurant_logic", language: "en", question: "Two orders arrive together. Order A has two dishes and has waited 15 minutes. Order B has eight dishes and has waited five minutes. Which should be prepared first?", expected_tools: [], must_include: ["Order A", "parallel", "kitchen capacity"] },
  { id: "logic-average-1", category: "restaurant_logic", language: "en", question: "Friday sales were $4,000, Saturday sales were $6,000 and Sunday sales were $5,000. What was the average daily sale?", expected_tools: [], must_include: ["$5,000", "$15,000"] },
  { id: "logic-performance-1", category: "restaurant_logic", language: "en", question: "Sales increased by 20%, but food waste increased by 50%. Is restaurant performance definitely improving?", expected_tools: [], must_include: ["Not necessarily", "profit", "waste"] },
  { id: "logic-reservations-1", category: "restaurant_logic", language: "en", question: "A restaurant received 100 reservations for 80 available seats at the same time. Give a practical solution.", expected_tools: [], must_include: ["Do not seat 100", "stagger", "waiting-list"] },
  { id: "logic-contradiction-1", category: "restaurant_logic", language: "en", question: "The manager says: Reduce staff to lower labour costs, but also guarantee zero waiting time. Is this instruction logically consistent?", expected_tools: [], must_include: ["not automatically", "Reducing staff", "waiting time"] },
  { id: "logic-uncertainty-1", category: "restaurant_logic", language: "en", question: "Yesterday was unusually busy. Tell me exactly how many cooks I need tomorrow.", expected_tools: [], must_include: ["cannot give an exact number", "Expected customers", "productivity"] },
  { id: "logic-staffing-1", category: "restaurant_logic", language: "en", question: "Tomorrow, 180 customers are expected. One waiter can effectively serve 20 customers during the main service period. The restaurant currently has seven waiters. Two additional temporary waiters are available for $60 each. How many more waiters are needed, and should the manager hire them?", expected_tools: [], must_include: ["2 more waiters", "$120", "180"] }
];
