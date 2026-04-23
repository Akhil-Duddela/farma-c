class PostModel {
  const PostModel({
    required this.id,
    this.caption = '',
    this.status = 'draft',
    this.mediaUrl = '',
    this.mediaType = 'image',
    this.scheduledAt,
    this.platforms,
    this.pipelineStatus,
  });

  final String id;
  final String caption;
  final String status;
  final String mediaUrl;
  final String mediaType;
  final String? scheduledAt;
  final Map<String, dynamic>? platforms;
  final String? pipelineStatus;

  factory PostModel.fromJson(Map<String, dynamic> j) {
    return PostModel(
      id: (j['_id'] ?? j['id']).toString(),
      caption: (j['caption'] ?? '') as String,
      status: (j['status'] ?? 'draft') as String,
      mediaUrl: (j['mediaUrl'] ?? '') as String,
      mediaType: (j['mediaType'] ?? 'image') as String,
      scheduledAt: j['scheduledAt']?.toString(),
      platforms: j['platforms'] is Map ? Map<String, dynamic>.from(j['platforms'] as Map) : null,
      pipelineStatus: j['pipelineStatus'] as String?,
    );
  }
}
