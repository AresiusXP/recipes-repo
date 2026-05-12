{{/*
Return the fully-qualified name for a given component.
Usage: include "recipes.componentFullname" (dict "component" "frontend" "context" .)
*/}}
{{- define "recipes.componentFullname" -}}
{{- $component := .component -}}
{{- $ctx := .context -}}
{{- printf "%s-%s" $ctx.Release.Name $component | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels for a component.
Usage: include "recipes.componentLabels" (dict "component" "frontend" "context" .)
*/}}
{{- define "recipes.componentLabels" -}}
helm.sh/chart: {{ printf "%s-%s" .context.Chart.Name .context.Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{ include "recipes.componentSelectorLabels" . }}
{{- if .context.Chart.AppVersion }}
app.kubernetes.io/version: {{ .context.Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .context.Release.Service }}
{{- end }}

{{/*
Selector labels for a component.
Usage: include "recipes.componentSelectorLabels" (dict "component" "frontend" "context" .)
*/}}
{{- define "recipes.componentSelectorLabels" -}}
app.kubernetes.io/name: recipes-{{ .component }}
app.kubernetes.io/instance: {{ .context.Release.Name }}
{{- end }}
