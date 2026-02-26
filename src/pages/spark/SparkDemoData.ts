export const SPARK_EMAIL_MONTHLY_QUOTA = 5000;

export const SPARK_DEMO_OVERVIEW = {
  contactsTotal: 842,
  contactsNew30d: 37,
  emailsSent30d: 1224,
  emailsRemaining: 3500,
  activeCampaigns: 3,
  upcomingCampaigns: 2,
};

export const SPARK_DEMO_CONTACTS = [
  {
    id: "c1",
    name: "Alexis Baker",
    email: "alexis@example.com",
    phone: "(515) 555-0110",
    tags: ["Customer", "Newsletter"],
    lastActivity: "Email open • 2 days ago",
    status: "Active",
  },
  {
    id: "c2",
    name: "Jordan Lee",
    email: "jordan@example.com",
    phone: "(515) 555-0142",
    tags: ["Lead", "Promo"],
    lastActivity: "Clicked link • 5 days ago",
    status: "Engaged",
  },
  // ... add a few more if you want
];

export const SPARK_DEMO_CAMPAIGNS_EMAIL = [
  {
    id: "e1",
    name: "Spring Kickoff",
    status: "Scheduled",
    sendAt: "Apr 10, 2026",
    recipients: 1200,
    openRate: "—",
    clickRate: "—",
  },
  {
    id: "e2",
    name: "Monthly Newsletter",
    status: "Completed",
    sendAt: "Mar 15, 2026",
    recipients: 950,
    openRate: "41%",
    clickRate: "9%",
  },
];

export const SPARK_DEMO_CAMPAIGNS_SMS = [
  {
    id: "s1",
    name: "Appointment Reminders",
    status: "Running",
    sendAt: "Daily",
    recipients: 134,
    replyRate: "18%",
  },
];