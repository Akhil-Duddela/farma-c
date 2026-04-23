class UserModel {
  const UserModel({
    required this.id,
    required this.email,
    this.name,
    this.emailVerified = false,
    this.phoneVerified = false,
    this.profileImageUrl = '',
    this.badges = const [],
    this.canUsePublishing = false,
    this.creatorLevel = 0,
    this.riskScore = 0,
  });

  final String id;
  final String email;
  final String? name;
  final bool emailVerified;
  final bool phoneVerified;
  final String profileImageUrl;
  final List<String> badges;
  final bool canUsePublishing;
  final int creatorLevel;
  final int riskScore;

  factory UserModel.fromJson(Map<String, dynamic> j) {
    final id = j['id']?.toString() ?? j['_id']?.toString() ?? '';
    return UserModel(
      id: id,
      email: (j['email'] ?? '') as String,
      name: j['name'] as String?,
      emailVerified: j['emailVerified'] == true,
      phoneVerified: j['phoneVerified'] == true,
      profileImageUrl: (j['profileImageUrl'] ?? '') as String,
      badges: (j['badges'] is List) ? (j['badges'] as List).map((e) => e.toString()).toList() : const [],
      canUsePublishing: j['canUsePublishing'] == true,
      creatorLevel: (j['creatorLevel'] is num) ? (j['creatorLevel'] as num).toInt() : 0,
      riskScore: (j['riskScore'] is num) ? (j['riskScore'] as num).toInt() : 0,
    );
  }
}
