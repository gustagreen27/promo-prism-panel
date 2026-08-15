import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

export function RenameReportButton({
  currentName,
  onConfirm,
}: {
  currentName: string;
  onConfirm: (name: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        title="Renomear relatório"
        onClick={(e) => {
          e.preventDefault();
          setName(currentName);
          setOpen(true);
        }}
      >
        <Pencil className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Renomear relatório</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="report-name">Nome do relatório</Label>
            <Input id="report-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button
              disabled={saving || !name.trim()}
              onClick={async () => {
                setSaving(true);
                try {
                  await onConfirm(name.trim());
                  setOpen(false);
                } catch (err: any) {
                  toast.error(err?.message ?? "Falha ao renomear.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
