import 'package:dio/dio.dart';

class ApiError implements Exception {
  const ApiError(
    this.message, {
    this.statusCode,
    this.code,
    this.details = const [],
  });
  final String message;
  final int? statusCode;
  final String? code;
  final List<dynamic> details;

  @override
  String toString() => message;
}

ApiError? parseDioError(DioException e) {
  final d = e.response?.data;
  if (d is Map && d['error'] is String) {
    return ApiError(
      d['error'] as String,
      statusCode: e.response?.statusCode,
      code: d['code'] as String?,
      details: d['details'] is List ? List<dynamic>.from(d['details'] as List) : const [],
    );
  }
  if (e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout) {
    return const ApiError('No network connection. Check your internet and try again.');
  }
  return null;
}
