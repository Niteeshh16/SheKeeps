package com.shekeeps.auth.service;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.shekeeps.auth.exception.ApiException;
import com.shekeeps.auth.dto.ApiModels.*;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;

@Service
public class AuthService {
    private final JdbcTemplate db;
    private final PasswordEncoder passwords;
    @Value("${app.jwt-access-secret}") private String accessSecret;
    @Value("${app.jwt-refresh-secret}") private String refreshSecret;
    @Value("${app.auth-bypass:false}") private boolean authBypass;
    @Value("${app.jwt-access-expiration:15m}") private String accessTtl;
    @Value("${app.jwt-refresh-expiration:7d}") private String refreshTtl;
    private SecretKeyHolder accessKey, refreshKey;
    private Duration accessDuration, refreshDuration;

    public AuthService(JdbcTemplate db, PasswordEncoder passwords) { this.db = db; this.passwords = passwords; }

    @PostConstruct void configure() {
        if (accessSecret.length() < 32 || refreshSecret.length() < 32)
            throw new IllegalStateException("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must each be at least 32 characters");
        accessKey = new SecretKeyHolder(accessSecret); refreshKey = new SecretKeyHolder(refreshSecret);
        accessDuration = duration(accessTtl); refreshDuration = duration(refreshTtl);
    }

    @Transactional public Map<String,Object> register(RegisterRequest req) {
        if (findByEmail(req.email()).isPresent()) throw new ApiException(HttpStatus.CONFLICT,"An account with this email address already exists");
        UUID id = db.queryForObject("INSERT INTO users(email,password_hash,name) VALUES(LOWER(?),?,?) RETURNING id", UUID.class,
                req.email().trim(), passwords.encode(req.password()), req.name().trim());
        User user = findById(id).orElseThrow();
        return authResponse(user,"Account created successfully");
    }

    @Transactional public Map<String,Object> login(LoginRequest req) {
        var row = db.query("SELECT id,email,password_hash,name,created_at,updated_at FROM users WHERE LOWER(email)=LOWER(?)", rs -> {
            if (!rs.next()) return null;
            return new Object[]{new User(rs.getObject("id", UUID.class),rs.getString("email"),rs.getString("name"),rs.getObject("created_at",OffsetDateTime.class),rs.getObject("updated_at",OffsetDateTime.class)),rs.getString("password_hash")};
        }, req.email().trim());
        if (row == null || !passwords.matches(req.password(),(String)row[1])) throw new ApiException(HttpStatus.UNAUTHORIZED,"Invalid email or password");
        return authResponse((User)row[0],"Logged in successfully");
    }

    @Transactional public Map<String,Object> refresh(String token) {
        if (token == null || token.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST,"Refresh token is required");
        Claims claims = parse(token,refreshKey);
        String hash = hash(token);
        UUID userId;
        try { userId = db.queryForObject("SELECT user_id FROM refresh_tokens WHERE token_hash=? AND expires_at>NOW()",UUID.class,hash); }
        catch (org.springframework.dao.EmptyResultDataAccessException ex) { throw new ApiException(HttpStatus.UNAUTHORIZED,"Refresh token has been revoked or is invalid"); }
        User user = findById(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED,"User not found"));
        db.update("DELETE FROM refresh_tokens WHERE token_hash=?",hash);
        Tokens tokens = issue(user); storeRefresh(user.id(),tokens.refreshToken());
        return Map.of("status","success","message","Tokens refreshed successfully","data",tokens);
    }

    @Transactional public void logout(String token) { if (token != null && !token.isBlank()) db.update("DELETE FROM refresh_tokens WHERE token_hash=?",hash(token)); }

    public User authenticate(String token) {
        if (authBypass) return guestUser();
        if (token == null || token.isBlank()) throw new ApiException(HttpStatus.UNAUTHORIZED,"Authentication required. Please log in.");
        Claims claims = parse(token,accessKey);
        try { return findById(UUID.fromString(claims.getSubject())).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED,"The user belonging to this token no longer exists.")); }
        catch (IllegalArgumentException ex) { throw new ApiException(HttpStatus.UNAUTHORIZED,"Invalid access token."); }
    }

    public boolean authBypassEnabled() { return authBypass; }

    private synchronized User guestUser() {
        var existing = findByEmail("guest@shekeeps.local");
        if (existing.isPresent()) return existing.get();
        UUID id = db.queryForObject("INSERT INTO users(email,password_hash,name) VALUES(?,?,?) RETURNING id", UUID.class,
                "guest@shekeeps.local", passwords.encode(UUID.randomUUID().toString()), "Local Guest");
        return findById(id).orElseThrow();
    }

    public boolean databaseHealthy() { try { return Boolean.TRUE.equals(db.queryForObject("SELECT TRUE",Boolean.class)); } catch (Exception ex) { return false; } }

    private Map<String,Object> authResponse(User user,String message) {
        Tokens tokens = issue(user); storeRefresh(user.id(),tokens.refreshToken());
        return Map.of("status","success","message",message,"data",Map.of("user",user,"accessToken",tokens.accessToken(),"refreshToken",tokens.refreshToken()));
    }
    private Tokens issue(User user) { Instant now=Instant.now(); return new Tokens(jwt(accessKey,user,now,accessDuration),jwt(refreshKey,user,now,refreshDuration)); }
    private String jwt(SecretKeyHolder key,User user,Instant now,Duration ttl) { return Jwts.builder().subject(user.id().toString()).claim("email",user.email()).claim("name",user.name()).issuedAt(Date.from(now)).expiration(Date.from(now.plus(ttl))).signWith(key.key).compact(); }
    private Claims parse(String token,SecretKeyHolder key) { try { return Jwts.parser().verifyWith(key.key).build().parseSignedClaims(token).getPayload(); } catch (ExpiredJwtException ex) { throw new ApiException(HttpStatus.UNAUTHORIZED,"Invalid or expired authentication token"); } catch (JwtException | IllegalArgumentException ex) { throw new ApiException(HttpStatus.UNAUTHORIZED,"Invalid authentication token"); } }
    private void storeRefresh(UUID id,String token) { db.update("INSERT INTO refresh_tokens(user_id,token_hash,expires_at) VALUES(?,?,?)",id,hash(token),OffsetDateTime.now(ZoneOffset.UTC).plus(refreshDuration)); }
    private Optional<User> findById(UUID id) { return db.query("SELECT id,email,name,created_at,updated_at FROM users WHERE id=?",rs -> rs.next()?Optional.of(user(rs)):Optional.empty(),id); }
    private Optional<User> findByEmail(String email) { return db.query("SELECT id,email,name,created_at,updated_at FROM users WHERE LOWER(email)=LOWER(?)",rs -> rs.next()?Optional.of(user(rs)):Optional.empty(),email.trim()); }
    private User user(java.sql.ResultSet rs) throws java.sql.SQLException { return new User(rs.getObject("id",UUID.class),rs.getString("email"),rs.getString("name"),rs.getObject("created_at",OffsetDateTime.class),rs.getObject("updated_at",OffsetDateTime.class)); }
    private String hash(String value) { try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); } catch(Exception ex) { throw new IllegalStateException(ex); } }
    private Duration duration(String s) { if(s.matches("\\d+d")) return Duration.ofDays(Long.parseLong(s.substring(0,s.length()-1))); if(s.matches("\\d+h")) return Duration.ofHours(Long.parseLong(s.substring(0,s.length()-1))); return Duration.parse("PT"+s.toUpperCase()); }
    private static class SecretKeyHolder { final javax.crypto.SecretKey key; SecretKeyHolder(String s){key=Keys.hmacShaKeyFor(s.getBytes(StandardCharsets.UTF_8));} }
}
