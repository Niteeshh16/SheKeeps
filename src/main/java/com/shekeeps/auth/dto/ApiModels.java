package com.shekeeps.auth.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

public final class ApiModels {
    private ApiModels() {}
    public record User(UUID id, String email, String name, OffsetDateTime created_at, OffsetDateTime updated_at) {}
    public record Tokens(String accessToken, String refreshToken) {}
    public record RegisterRequest(@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Email @jakarta.validation.constraints.Size(max=255) String email,
      @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(min=8,max=100) @jakarta.validation.constraints.Pattern(regexp="(?=.*[A-Za-z])(?=.*[0-9]).*", message="Password must contain at least one letter and one number") String password,
      @jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Size(min=2,max=100) String name) {}
    public record LoginRequest(@jakarta.validation.constraints.NotBlank @jakarta.validation.constraints.Email String email, @jakarta.validation.constraints.NotBlank String password) {}
    public record TokenRequest(String refreshToken) {}
}
