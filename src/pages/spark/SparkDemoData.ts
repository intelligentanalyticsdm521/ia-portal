export const SPARK_EMAIL_MONTHLY_QUOTA = 5000;

export const SPARK_DEMO_OVERVIEW = {
  contacts_total: 842,
  contacts_new_30d: 37,
  emails_sent_30d: 1224,
  emails_remaining: 3500,
  active_campaigns: 3,
  upcoming_campaigns: 2,
};

export const SPARK_DEMO_CONTACTS = [
  {
    id: "c1",
    name: "Alexis Baker",
    email: "alexis@example.com",
    phone: "(515) 555-0110",
    tags: ["Customer", "Newsletter"],
    last_activity: "Email open • 2 days ago",
    status: "Active",
  },
  {
    id: "c2",
    name: "Jordan Lee",
    email: "jordan@example.com",
    phone: "(515) 555-0142",
    tags: ["Lead", "Promo"],
    last_activity: "Clicked link • 5 days ago",
    status: "Engaged",
  },
  // ... add a few more if you want
];

export const SPARK_DEMO_CAMPAIGNS_EMAIL = [
  {
    id: "e1",
    name: "Spring Kickoff",
    status: "Scheduled",
    sent_at: "Apr 10, 2026",
    total_recipients: 1200,
    open_rate: "—",
    click_rate: "—",
  },
  {
    id: "e2",
    name: "Monthly Newsletter",
    status: "Completed",
    sent_at: "Mar 15, 2026",
    total_recipients: 950,
    open_rate: "41%",
    click_rate: "9%",
  },
];

export const SPARK_DEMO_CAMPAIGNS_SMS = [
  {
    id: "s1",
    name: "Appointment Reminders",
    status: "Running",
    sent_at: "Daily",
    total_recipients: 134,
    reply_rate: "18%",
  },
];