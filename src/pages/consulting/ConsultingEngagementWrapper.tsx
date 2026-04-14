import { ConsultingTasksPage } from "./ConsultingTasksPage";
import { ConsultingDeliverablesPage } from "./ConsultingDeliverablesPage";

interface ConsultingEngagementWrapperProps {
  engagementType: string;
  view: "tasks" | "deliverables";
}

export function ConsultingEngagementWrapper({ engagementType, view }: ConsultingEngagementWrapperProps) {
  if (view === "deliverables") {
    return <ConsultingDeliverablesPage engagementType={engagementType} />;
  }
  return <ConsultingTasksPage engagementType={engagementType} />;
}
