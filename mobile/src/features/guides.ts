// Short written instructions: a list of guides, each made of questions with their answers (js/screens/guides.js).
export interface Guide { id: string; title: string; about: string; sections: readonly (readonly [string, string])[] }
export const GUIDES: readonly Guide[] = [
  {
    "id": "operations",
    "title": "Operations",
    "about": "Create, edit and plan operations",
    "sections": [
      [
        "How to add an expense",
        "On the Operations tab tap Add and choose Expenses. Pick a category, type the amount on the keypad and tap the check mark. The account can be changed in the same window."
      ],
      [
        "How to add an income",
        "Choose Incomes in the same window, pick a category and enter the amount."
      ],
      [
        "How to add a transfer between accounts",
        "Choose Accounts in the add window and pick the account the money leaves. In the editor choose the account it goes to and enter the amount."
      ],
      [
        "How to change an operation",
        "Tap the operation in the list, change what you need and save. To delete several at once, hold one operation and tick the others."
      ],
      [
        "How to add a comment to an operation",
        "Open the operation and write the text in the comment field. Comments can be searched with the search button of the operations list."
      ],
      [
        "How to create a scheduled payment",
        "Open More → Scheduled payments and tap Add. Choose the date, a repeat and a reminder if needed, and fill in the payment like an ordinary operation. When its day comes, the payment is added to the operations by itself."
      ],
      [
        "What if the account and the category use different currencies?",
        "Two amounts are shown. Change either one and the other is recalculated; the operation keeps its own rate."
      ]
    ]
  },
  {
    "id": "accounts",
    "title": "Accounts and categories",
    "about": "Creating, editing, working with accounts and categories",
    "sections": [
      [
        "How to create an account",
        "On the Accounts tab tap the plus and choose the type of the account. Then enter the title, the currency and the starting balance."
      ],
      [
        "How to create a category",
        "On the Categories tab tap the pencil, then Create a new category. Choose its name, icon, colour and currency."
      ],
      [
        "How to switch to income categories",
        "On the Categories tab use the Expenses and Incomes tabs at the top."
      ],
      [
        "How to change the order of categories",
        "Tap the pencil on the Categories tab, hold a category and drag it to a new place."
      ],
      [
        "How to change the order of accounts",
        "On the Accounts tab hold an account and drag it to a new place in the list."
      ],
      [
        "What happens to an archived account or category?",
        "It leaves the lists but stays in the history of operations."
      ]
    ]
  },
  {
    "id": "statistics",
    "title": "Statistics",
    "about": "Sorting, filtering and viewing statistics",
    "sections": [
      [
        "How to show a list of operations and their amount only for a specific account",
        "Tap the filter button, choose the account and apply. The statistics and the operations show only that account, and a bar at the top tells that a filter is on."
      ],
      [
        "How to show a list of operations and their amount only for a specific category",
        "Tap the category in the report: the operations of the category open with their total."
      ],
      [
        "How to change the period",
        "Use the arrows to move between periods. Tap the date to choose another interval."
      ],
      [
        "How to choose which blocks the statistics show",
        "Open More → Settings → Styles and elements → Elements → Statistics. Switch blocks on and off, hold a row and drag it to change the order."
      ]
    ]
  },
  {
    "id": "questions",
    "title": "Additional questions",
    "about": "Ask us any question and we will gladly answer",
    "sections": [
      [
        "Where is my data?",
        "Only on this device, in the application's own storage. Make a copy in More → Data before clearing the application data, uninstalling it or changing the phone."
      ],
      [
        "How do I change the currency?",
        "Open More → Settings → Formatting and choose the main currency."
      ],
      [
        "How do I hide the amounts?",
        "Open More → Settings → Privacy and choose what is hidden."
      ],
      [
        "Another question?",
        "Write to us in More → Support → Question on how to use."
      ]
    ]
  }
];
