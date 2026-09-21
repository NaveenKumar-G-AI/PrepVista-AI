'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/use-toast';

interface CreateIntegrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateIntegrationDialog({ open, onOpenChange, onSuccess }: CreateIntegrationDialogProps) {
  const { getAccessToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'PREPVISTA',
    externalId: '',
    webhookUrl: '',
    apiBaseUrl: 'https://api.prepvista.example.com',
    apiVersion: 'v1',
    timeoutMs: 30000,
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = await getAccessToken();
      const config = {
        webhookUrl: formData.webhookUrl,
        apiBaseUrl: formData.apiBaseUrl,
        apiVersion: formData.apiVersion,
        timeoutMs: formData.timeoutMs,
        retryPolicy: {
          maxRetries: formData.maxRetries,
          baseDelayMs: formData.baseDelayMs,
          maxDelayMs: formData.maxDelayMs,
          backoffMultiplier: formData.backoffMultiplier,
        },
      };

      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          externalId: formData.externalId || undefined,
          config,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create integration');
      }

      toast({ title: 'Integration created', description: 'You can now configure credentials and mappings.' });
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create integration';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Create PrepVista Integration</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Integration Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., PrepVista Production"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="externalId">External ID (Optional)</Label>
            <Input
              id="externalId"
              value={formData.externalId}
              onChange={(e) => setFormData({ ...formData, externalId: e.target.value })}
              placeholder="PrepVista organization identifier"
            />
          </div>

          <Separator />

          <h4 className="font-medium">Webhook Configuration</h4>
          <div className="space-y-2">
            <Label htmlFor="webhookUrl">Webhook URL *</Label>
            <Input
              id="webhookUrl"
              type="url"
              value={formData.webhookUrl}
              onChange={(e) => setFormData({ ...formData, webhookUrl: e.target.value })}
              placeholder="https://your-prepvista-instance.com/webhook/integrations/codeforge"
              required
            />
            <p className="text-sm text-muted-foreground">
              PrepVista will receive events at this URL
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiBaseUrl">API Base URL</Label>
            <Input
              id="apiBaseUrl"
              type="url"
              value={formData.apiBaseUrl}
              onChange={(e) => setFormData({ ...formData, apiBaseUrl: e.target.value })}
              placeholder="https://api.prepvista.example.com"
            />
          </div>

          <Separator />

          <h4 className="font-medium">Retry Policy</h4>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="maxRetries">Max Retries</Label>
              <Select
                value={String(formData.maxRetries)}
                onValueChange={(value) => setFormData({ ...formData, maxRetries: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3, 4, 5, 10].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseDelayMs">Base Delay (ms)</Label>
              <Input
                id="baseDelayMs"
                type="number"
                value={formData.baseDelayMs}
                onChange={(e) => setFormData({ ...formData, baseDelayMs: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxDelayMs">Max Delay (ms)</Label>
              <Input
                id="maxDelayMs"
                type="number"
                value={formData.maxDelayMs}
                onChange={(e) => setFormData({ ...formData, maxDelayMs: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="backoffMultiplier">Backoff Multiplier</Label>
              <Input
                id="backoffMultiplier"
                type="number"
                step="0.1"
                value={formData.backoffMultiplier}
                onChange={(e) => setFormData({ ...formData, backoffMultiplier: parseFloat(e.target.value) })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeoutMs">Request Timeout (ms)</Label>
            <Input
              id="timeoutMs"
              type="number"
              value={formData.timeoutMs}
              onChange={(e) => setFormData({ ...formData, timeoutMs: parseInt(e.target.value) })}
            />
          </div>

          <DialogFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Integration'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}