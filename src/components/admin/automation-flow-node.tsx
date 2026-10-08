import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { Play, MessageSquare, MousePointerClick, Image, Video, FileText, Clock3, GitBranch, Tags, Headphones, Globe, CircleStop, LayoutTemplate } from "lucide-react";
import { BLOCK_MAP, isTrigger } from "@/lib/automation-graph";

export type FlowNodeData = { type: string; label?: string; config: Record<string, any>; summary?: string; invalid?: boolean; ordinal?: string };

export function blockAppearance(type: string, config: Record<string, any> = {}) {
  if (isTrigger(type)) return { tone: "start", icon: Play, label: "Início" };
  if (type === "send_text") return { tone: "text", icon: MessageSquare, label: "Texto" };
  if (type === "send_buttons") return { tone: "buttons", icon: MousePointerClick, label: "Texto + Botão" };
  if (type === "send_template") return { tone: "template", icon: LayoutTemplate, label: "Template" };
  if (type === "send_media") return { tone: "media", icon: config.mediaType === "video" ? Video : config.mediaType === "document" ? FileText : Image, label: config.mediaType === "video" ? "Vídeo" : config.mediaType === "document" ? "Documento" : "Imagem" };
  if (type.startsWith("wait_")) return { tone: "delay", icon: Clock3, label: type === "wait_duration" ? "Delay" : BLOCK_MAP[type]?.label };
  if (type.startsWith("cond_")) return { tone: "condition", icon: GitBranch, label: BLOCK_MAP[type]?.label };
  if (type === "act_handoff") return { tone: "handoff", icon: Headphones, label: "Atendimento" };
  if (type === "act_http") return { tone: "template", icon: Globe, label: "Requisição HTTP" };
  if (type === "end") return { tone: "end", icon: CircleStop, label: "Encerrar" };
  return { tone: "condition", icon: Tags, label: BLOCK_MAP[type]?.label };
}

export function AutomationFlowNode({ data, selected }: NodeProps<Node<FlowNodeData>>) {
  const def = BLOCK_MAP[data.type];
  if (!def) return null;
  const appearance = blockAppearance(data.type, data.config);
  const Icon = appearance.icon;
  const compact = data.type === "wait_duration" || data.type === "end";
  const text = data.config.text || data.config.caption || data.summary;
  return (
    <div className={`automation-node ${compact ? "automation-node-compact" : ""}`} data-tone={appearance.tone} data-selected={selected} data-invalid={data.invalid}>
      {!isTrigger(data.type) && <Handle type="target" position={Position.Left} className="automation-port" />}
      <div className="automation-node-heading">
        <span className="automation-node-icon"><Icon size={18} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{data.label || appearance.label}</div>
          {isTrigger(data.type) && <div className="mt-0.5 text-[10px]">{def.label}</div>}
          {compact && data.type === "wait_duration" && <div className="mt-0.5 text-base font-semibold">{data.config.amount}{({ seconds: "s", minutes: " min", hours: "h", days: "d" } as Record<string, string>)[data.config.unit] ?? ""}</div>}
        </div>
        <span className="automation-node-number">{data.ordinal}</span>
      </div>
      {!compact && <>
        {data.type === "send_media" && <div className="automation-media-preview">
          {data.config.url && data.config.mediaType === "image" ? <img src={data.config.url} alt={data.config.caption || "Imagem da mensagem"} className="h-full w-full object-contain" /> : <Icon size={32} strokeWidth={1.5} />}
        </div>}
        <div className="automation-node-body">{text || def.label}</div>
        {data.type === "send_buttons" && (data.config.buttons ?? []).map((button: { id: string; title: string }) => <div key={button.id} className="automation-button-preview">{button.title || button.id}</div>)}
      </>}
      {def.outputs.length === 1 && <Handle id={def.outputs[0].id} type="source" position={Position.Right} className="automation-port" />}
      {def.outputs.length > 1 && <div className="automation-node-outputs">{def.outputs.map((output) => <div key={output.id} className="automation-node-output">{output.label}<Handle id={output.id} type="source" position={Position.Right} className="automation-port" /></div>)}</div>}
    </div>
  );
}