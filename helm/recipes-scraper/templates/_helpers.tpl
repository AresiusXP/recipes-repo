{{/*
Expand the name of the chart.
*/}}
{{- define "recipes-scraper.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "recipes-scraper.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "recipes-scraper.labels" -}}
helm.sh/chart: {{ include "recipes-scraper.name" . }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "recipes-scraper.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "recipes-scraper.selectorLabels" -}}
app.kubernetes.io/name: {{ include "recipes-scraper.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}
