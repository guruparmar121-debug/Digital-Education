import MasterPage, { StatusCell } from "@/pages/MasterPage";
import { useMasters } from "@/components/Filters";

const nameOf = (list, id) => list.find((x) => x.id === id)?.name || "—";

export function Blocks() {
  return <MasterPage entity="blocks" title="Block Master" subtitle="Programme blocks and districts"
    fields={[{ key: "block_code", label: "Block ID" }, { key: "name", label: "Block Name" },
      { key: "district", label: "District" },
      { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }]}
    columns={[{ key: "block_code", label: "Block ID" }, { key: "name", label: "Block Name" },
      { key: "district", label: "District" }, { key: "status", label: "Status", render: StatusCell }]} />;
}

export function Villages() {
  const { blocks } = useMasters();
  return <MasterPage entity="villages" title="Village Master" subtitle="Villages mapped to blocks"
    fields={[{ key: "village_code", label: "Village ID" }, { key: "name", label: "Village Name" },
      { key: "block_id", label: "Block", type: "select", source: "blocks" },
      { key: "district", label: "District" },
      { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }]}
    columns={[{ key: "village_code", label: "Village ID" }, { key: "name", label: "Village Name" },
      { key: "block_id", label: "Block", render: (r) => nameOf(blocks, r.block_id) },
      { key: "district", label: "District" }, { key: "status", label: "Status", render: StatusCell }]} />;
}

export function Schools() {
  const { blocks, villages } = useMasters();
  return <MasterPage entity="schools" title="School Master" subtitle="Schools with principal and contact details"
    fields={[{ key: "school_code", label: "School ID" }, { key: "name", label: "School Name" },
      { key: "block_id", label: "Block", type: "select", source: "blocks" },
      { key: "village_id", label: "Village", type: "select", source: "villages" },
      { key: "address", label: "Address", wide: true },
      { key: "principal_name", label: "Principal Name" }, { key: "contact", label: "Contact Number" },
      { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }]}
    columns={[{ key: "school_code", label: "School ID" }, { key: "name", label: "School Name" },
      { key: "block_id", label: "Block", render: (r) => nameOf(blocks, r.block_id) },
      { key: "village_id", label: "Village", render: (r) => nameOf(villages, r.village_id) },
      { key: "principal_name", label: "Principal" }, { key: "contact", label: "Contact" },
      { key: "status", label: "Status", render: StatusCell }]} />;
}

export function Teachers() {
  const { blocks, schools } = useMasters();
  return <MasterPage entity="teachers" title="Teacher / Staff Master" subtitle="Staff assigned to schools and classes"
    fields={[{ key: "staff_code", label: "Staff ID" }, { key: "name", label: "Name" },
      { key: "mobile", label: "Mobile" }, { key: "email", label: "Email" },
      { key: "role", label: "Role", type: "select", options: [{ value: "teacher", label: "Teacher" }, { value: "coordinator", label: "Coordinator" }, { value: "staff", label: "Staff" }] },
      { key: "school_id", label: "School", type: "select", source: "schools" },
      { key: "block_id", label: "Block", type: "select", source: "blocks" },
      { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }]}
    columns={[{ key: "staff_code", label: "Staff ID" }, { key: "name", label: "Name" },
      { key: "mobile", label: "Mobile" }, { key: "email", label: "Email" }, { key: "role", label: "Role" },
      { key: "school_id", label: "School", render: (r) => nameOf(schools, r.school_id) },
      { key: "block_id", label: "Block", render: (r) => nameOf(blocks, r.block_id) },
      { key: "standards", label: "Classes", render: (r) => (r.standards || []).join(", ") || "—" },
      { key: "status", label: "Status", render: StatusCell }]} />;
}
