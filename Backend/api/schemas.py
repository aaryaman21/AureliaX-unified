from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "VoiceShield AI"


class AnalysisResponseSchema(BaseModel):
    metricsSource: str = 'classifier_only'
    id: str
    callId: str
    timestamp: str
    syntheticProbability: float = Field(..., description="0-100: probability of AI/synthetic origin")
    speakerSimilarity: float = Field(default=0.0, description="0-100")
    emotion: str = Field(default="Neutral")
    emotionalConsistency: float = Field(default=85.0)
    prosodyScore: float = Field(default=75.0)
    pitchVariation: float = Field(default=70.0)
    speakingRate: float = Field(default=65.0)
    vocalEnergy: float = Field(default=70.0)
    rhythm: float = Field(default=80.0)
    stressPattern: float = Field(default=75.0)
    hesitationIndex: float = Field(default=15.0)
    pauseAnomaly: str = Field(default="LOW", description="LOW | MEDIUM | HIGH")
    pauseFrequency: float = Field(default=4.0)
    avgPauseDuration: float = Field(default=500.0)
    abruptPauses: int = Field(default=0)
    temporalConsistency: float = Field(default=85.0)
    avgResponseLatency: float = Field(default=500.0)
    turnTakingConsistency: float = Field(default=85.0)
    detectedLanguage: str = Field(default="English")
    languageConfidence: float = Field(default=95.0)
    overallRiskScore: float = Field(..., description="0-100")
    riskLevel: str = Field(..., description="SAFE | SUSPICIOUS | HIGH_RISK")
    riskFactors: List[str] = Field(default_factory=list)
    recommendation: str = Field(..., description="CONTINUE | VERIFY_CALLER | END_CALL")
    recommendationReason: str


class BackendMetaInfo(BaseModel):
    fallbackUsed: bool = False
    fallbackReason: Optional[str] = None
    model: str = "VoiceShield WavLM"
    analysisType: str = "audio_file"
    durationSeconds: float = 0.0
    totalChunksAnalyzed: int = 0
    highRiskChunkCount: int = 0
    suspiciousChunkCount: int = 0
    audioUrl: Optional[str] = None
    logId: Optional[str] = None
    fileName: Optional[str] = None


class AnalyzeResultWrapper(BaseModel):
    success: bool = True
    analysis: AnalysisResponseSchema
    backend: BackendMetaInfo
    detectedSpeakers: Optional[int] = 1
    speakers: Optional[List[Dict[str, Any]]] = None
    diarizationSegments: Optional[List[Dict[str, Any]]] = None
    audioUrl: Optional[str] = None
    logId: Optional[str] = None
