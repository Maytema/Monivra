/* Short written instructions: a list of guides, each made of titled paragraphs */

export const GUIDES = [
  {
    id: "operations",
    title: "Operations",
    icon: "receipt",
    about: "Create, edit and plan operations",
    sections: [
      [
        "Add an operation",
        "Open Operations and tap Add. Pick an expense or income category, or open Accounts to move money between two accounts.",
      ],
      [
        "Amount",
        "Type the amount on the keypad. You can calculate with + − × ÷. The check mark saves the operation.",
      ],
      [
        "Different currencies",
        "When the account and the category use different currencies, two amounts are shown. Change either one and the other is recalculated. The operation keeps its own rate.",
      ],
      [
        "Edit and delete",
        "Tap an operation to change it. Hold one to select several and delete them together.",
      ],
      [
        "Plan ahead",
        "Use Additionally in the editor to set a reminder or a repeat. All planned payments are listed in More → Scheduled payments.",
      ],
    ],
  },
  {
    id: "accounts",
    title: "Accounts and categories",
    icon: "wallet",
    about: "Creating, editing, working with accounts and categories",
    sections: [
      [
        "Accounts",
        "Tap + on the Accounts tab. A regular account can have a credit limit, a savings account has a goal, a debt account tracks the amount owed.",
      ],
      [
        "Balance",
        "A balance can be negative. Tap an account for quick actions: top up, debit, transfer, edit or archive.",
      ],
      ["Order", "Hold an account and drag it to a new place in the list."],
      [
        "Categories",
        "On the Categories tab switch between expenses and incomes. The pencil opens the list for editing, a category can have subcategories.",
      ],
      [
        "Archive",
        "An archived account or category leaves the lists but stays in the history of operations.",
      ],
    ],
  },
  {
    id: "statistics",
    title: "Statistics",
    icon: "stats",
    about: "Sorting, filtering and viewing statistics",
    sections: [
      [
        "Period",
        "Use the arrows to move between periods. Tap the date to choose another interval.",
      ],
      [
        "Expenses and incomes",
        "Switch between them at the top. The report shows how the total is divided between categories.",
      ],
      [
        "Filters",
        "The filter button narrows the report to the accounts, categories, types and tags you choose.",
      ],
    ],
  },
  {
    id: "questions",
    title: "Additional questions",
    icon: "help",
    about: "Ask us any question and we will gladly answer",
    sections: [
      [
        "Where is my data?",
        "Only on this device, in this browser. Make a copy in More → Data before clearing browser data.",
      ],
      [
        "How do I change the currency?",
        "Open More → Settings → Formatting and choose the main currency.",
      ],
      ["How do I hide the amounts?", "Open More → Settings → Privacy and choose what is hidden."],
      ["Another question?", "Write to us in More → Support → Question on how to use."],
    ],
  },
];
